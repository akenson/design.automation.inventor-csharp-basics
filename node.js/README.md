# Inventor & Design Automation API Node.js Sample

This should contain everything that a Forge developer needs to do to get started writing a sample service or application with the Design Automation API and Inventor in Node.js.

## Getting started
### Prerequisites
* Node v8.0+ https://nodejs.org/en/download/

### Running the sample
* Install node modules
  ```
  npm install
  ```
* Load the server.js file in an IDE and run it or use this command on the commandline `node server.js`
* forge.js contains code for using the forge APIs needed by the sample
* utilities.js contains helper functions used in server

### Server File flow
* The server has three main stages of working:
	* Setup: This is where the app is created and used to set up the activity
	* Run: After the activity is created, it's used to create the work items
	* Output: This checks for the completion of the work item and downloads a status report as well as an output file in case of a success (located in documents)
* Due to the asynchronous nature of Node, we use promises and async/await to make sure that the methods get executed in the order they are supposed so that correct params get passed on the the methods that need them.