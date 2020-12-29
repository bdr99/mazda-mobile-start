This library allows interaction with the [Mazda Mobile Start](https://www.mazdamobilestart.com/) API. Using this library, you can start or stop a Mazda vehicle equipped with the Mazda Mobile Start accessory.

This library was developed by reverse-engineering the [Mazda Mobile Start](https://play.google.com/store/apps/details?id=com.mazda.mms) Android app.

Note: the Mazda Mobile Start service will be discontinued on September 30, 2021.

# Usage
```javascript
// Initialize the Mazda Mobile Start client with the same credentials you use to login to the app
const mmsClient = new MMS({
    username: "yourUsername",
    password: "yourPassword",
    pin: "1234"
});

// Start the vehicle
await mmsClient.startCar();

// Stop the vehicle
await mmsClient.stopCar();
```