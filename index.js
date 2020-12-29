const request = require("request-promise-native").defaults({ baseUrl: "https://control.marcs-web.com/marcs_mzd/services/" });
const uuid = require("uuid/v4");
const xml2js = require("xml2js");
const shajs = require("sha.js");

function xmlParse(str) {
    return new Promise(function (resolve, reject) {
        xml2js.parseString(str, function (err, result) {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
    });
}

function generateTrackingId() {
    return "3" + uuid().replace(/-/g, "");
}

async function getSession(username, password) {
    //Use hash of username and password as phone id
    //That way, it will remain constant for a given account
    let phoneID = "3" + shajs("sha256").update(username + password).digest("hex").substr(0, 32);

    let body = await request.post("LoginUncertified", {
        form: {
            id: username,
            password: password,
            phoneId: phoneID,
            deviceType: 3,
            deviceVersion: "1.2.0",
            phoneIdUpdate: 0,
            trackingId: generateTrackingId()
        }
    });

    if (body.includes("APA-0010")){
        //phone id is incorrect - need to update phone id
        body = await request.post("LoginUncertified", {
            form: {
                id: username,
                password: password,
                phoneId: phoneID,
                deviceType: 3,
                deviceVersion: "1.2.0",
                phoneIdUpdate: 1,
                trackingId: generateTrackingId()
            }
        });
    }

    if (!body.includes("success")) throw new Error("Login error");

    let parsed = await xmlParse(body);
    let authInfo = parsed.LoginUncertified.responseData[0].authInfo[0];

    return authInfo;
}

async function getECUInfo(authInfo) {
    let body = await request.post("GetECUInfo", {
        form: {
            authInfo: authInfo,
            trackingId: generateTrackingId()
        }
    });
    if (!body.includes("success")) throw new Error("getECUInfo error");

    let parsed = await xmlParse(body);

    return {
        name: parsed.GetEcuInfo.responseData[0].resEcuName[0],
        nickname: parsed.GetEcuInfo.responseData[0].resEcuNickName[0]
    };
}

async function reqResInfoUpdate(authInfo) {
    let trackingId = generateTrackingId();
    let body = await request.post("ReqRESInfoUpdate", {
        form: {
            authInfo: authInfo,
            trackingId: trackingId
        }
    });
    if (!body.includes("success")) throw new Error("ReqRESInfoUpdate error");

    let eventState = "0";
    while (eventState === "0") {
        let body2 = await request.post("GetCommandState", {
            form: {
                authInfo: authInfo,
                trackingId: trackingId
            }
        });
        if (!body2.includes("success")) throw new Error("ReqRESInfoUpdate2 error");
        let parsed2 = await xmlParse(body2);

        eventState = parsed2.GetCommandState.responseData[0].eventState[0];
    }

    if (eventState !== "1") throw new Error("ReqRESInfoUpdate error - eventState: " + eventState);

    return;
}

async function getCarInfo(authInfo) {
    let body = await request.post("GetCarInfo", {
        form: {
            authInfo: authInfo,
            trackingId: generateTrackingId()
        }
    });
    if (!body.includes("success")) throw new Error("GetCarInfo error");
    let parsed = await xmlParse(body);

    return {
        engineState: parsed.GetCarInfo.responseData[0].engineState[0], //"1" = off, "3" = on
        canStopEngine: parsed.GetCarInfo.responseData[0].canStopEngine[0],
        totalRemainderTime: parsed.GetCarInfo.responseData[0].totalRemainderTime[0]
    };
}

async function startEngine(authInfo, pin) {
    let trackingId = generateTrackingId();
    let body = await request.post("SendCmdEngineStart", {
        form: {
            authInfo: authInfo,
            nip: shajs("sha256").update(pin + authInfo).digest("hex"),
            latitude: 0,
            longitude: 0,
            acSetting: 1,
            distCheck: 1,
            trackingId: trackingId,
            defoggerState: 1,
            idleTime: 1200
        }
    });
    if (!body.includes("success")) throw new Error("Error starting engine");

    return;
}

async function stopEngine(authInfo) {
    let trackingId = generateTrackingId();
    let body = await request.post("SendCmdEngineStop", {
        form: {
            authInfo: authInfo,
            trackingId: trackingId
        }
    });
    if (!body.includes("success")) throw new Error("Error stopping engine");

    return;
}

function MMS(config) {
    if (!config.username || !config.password || !config.pin) {
        throw new Error("username, password, and pin are required");
    }

    this.username = config.username;
    this.password = config.password;
    this.phoneID = config.phoneID;
    this.pin = config.pin;
}

MMS.prototype.startCar = async function () {
    let authInfo = await getSession(this.username, this.password, this.phoneID);
    let ecuInfo = await getECUInfo(authInfo);
    let carInfo = await getCarInfo(authInfo);

    if (carInfo.engineState !== "1") throw new Error("Engine is already running");
    if (carInfo.totalRemainderTime === "0") throw new Error("Security timeout - car must be started manually");

    await startEngine(authInfo, this.pin);

    return ecuInfo.name + " was successfully started";
}

MMS.prototype.stopCar = async function () {
    let authInfo = await getSession(this.username, this.password, this.phoneID);
    let ecuInfo = await getECUInfo(authInfo);
    let carInfo = await getCarInfo(authInfo);

    if (carInfo.canStopEngine !== "1") throw new Error("Engine cannot be stopped now");

    await stopEngine(authInfo);

    return ecuInfo.name + " was successfully stopped";
}

module.exports = MMS;