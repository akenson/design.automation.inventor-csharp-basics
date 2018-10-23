const fs = require('fs');
const https = require('https');
const request = require('request');
const path = require('path');
const homedir = path.join(process.env.SystemDrive, (process.platform === 'win32') ? process.env.HOMEPATH : process.env.HOME);
const documentsDir = path.join(homedir, 'Documents');
const postKeys = ["key", "success_action_status", "success_action_redirect", "content-type", "policy", "x-amz-signature", "x-amz-credential",
    "x-amz-algorithm", "x-amz-date", "x-amz-server-side-encryption", "x-amz-security-token"];

module.exports = {
    // upload an app
    uploadAppBundle: function (formData, uploadUrl) {
        return new Promise(function (resolve, reject) {
            let formContent = {};
            postKeys.forEach(key => {
                formContent[key] = formData[key];
            });
            formContent.file = fs.createReadStream('../Solution/Output/samplePlugin.Bundle.zip');
            request({
                method: 'POST',
                url: uploadUrl,
                formData: formContent
            }, function (error, res) {
                if (error) {
                    console.log('The following error occurred while uploading the data: ');
                    console.log(error);
                    reject(error);
                }
                resolve(res);
            });
        });
    },

    // download files to the local disk
    downloadToDocs: function (returnUrl, localUrl) {
        return new Promise(function (fulfill, reject) {
            EnsureFoldersExist(documentsDir);
            var path = documentsDir + '\\' + localUrl;
            var file = fs.createWriteStream(path);
            https.get(returnUrl, function (response) {
                response.pipe(file);
                file.on('finish', function () {
                    console.log('Downloading the ' + localUrl + ' file...');
                    console.log('Writing to: ' + localUrl + '...');
                    console.log('File written: ' + localUrl);
                    file.close(); // close() is async
                    fulfill();
                });
            }).on('error', function (err) { // Handle errors
                if (err) reject('Error writing file: ' + err);
            });
        });
    }
};
// prevent error if the necessary folders don't exist
function EnsureFoldersExist (subdir) {
    if (!fs.existsSync(homedir)) {
        fs.mkdirSync(homedir);
    }
    if (!fs.existsSync(subdir)) {
        fs.mkdirSync(subdir);
    }
}