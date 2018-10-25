const path = require('path');
const { promisify } = require('util');
const utilities = require('./utilities');
const fs = require('fs');
const fsAccessAsync = promisify(fs.access);
const config = require('../config/config.json');
const { ForgeDmClient, ForgeDaClient } = require('./forge');
const alias = 'prod';
let nickname = '';

console.log('Program starting...');
let forgeDmClient = new ForgeDmClient();
let forgeDaClient = new ForgeDaClient();
main().then(() => {
    console.log('Program finished.');
});

async function main() {
    try {
        await forgeDmClient.init();
        await ensureBucketExists(config.InputBucketId);
        await ensureInputExists(config.InputPartFile);
        await ensureInputExists(config.InputAssemblyZipFile);
        await ensureBucketExists(config.OutputBucketId);
        await forgeDaClient.init();
        // Get the user's nickname for querying if apps and activities exist. If no nickname is set, the forge app id will be returned
        nickname = await forgeDaClient.getNickname();
        await setupAppBundle();
        await setupActivity();
        await createPartWorkItem();
        await createAssemblyWorkItem();
    } catch (error) {
        console.error(error);
    }
}

/**
 * Create a bucket if needed
 */
async function ensureBucketExists(bucketId) {
    console.log('Setting up output bucket...');
    console.log(`Checking if ${bucketId} exists...`);
    let bucketExists = await forgeDmClient.bucketExists(bucketId);
    if (bucketExists) {
        console.log('Found existing bucket');
    } else {
        console.log('Creating bucket...');
        await forgeDmClient.createBucket(bucketId);
    }
}

/**
 * Upload inputs if needed
 */
async function ensureInputExists(file) {
    console.log(`Checking if input ${file} is in bucket ${config.InputBucketId}...`);
    let localPath = path.join("../sample-inputs", file);
    let err = await fsAccessAsync(localPath, fs.constants.R_OK);
    if (err) {
        throw new Error(`Cannot read local input file: ${localPath}`);
    }
    let inputExists = await forgeDmClient.objectExists(config.InputBucketId, file);
    if (!inputExists) {
        console.log(`Uploading input ${localPath}...`);
        await forgeDmClient.uploadBucketObject(localPath, config.InputBucketId, file);
    } else {
        console.log('Found existing input');
    }
}

/**
 * Create the app (or new version of it) that will be used with both the assembly and part activities and workItems
 */
async function setupAppBundle() {
    console.log('Setting up app...');
    let appId = config.AppId;
    let appbundles = await forgeDaClient.getAppBundles();
    let appExists = false;
    let appName = `${nickname}.${appId}+${alias}`;
    for (let app of appbundles) {
        if (app === appName) {
            appExists = true;
            console.log(`Found existing app ${appId}`);
        }
    }

    let app = null;
    if (!appExists) {
        console.log(`Creating app ${appId}...`);
        app = await forgeDaClient.postAppBundle(config.EngineName, appId);
    } else {
        console.log(`Creating new version for app ${appId}`);
        app = await forgeDaClient.postAppBundleVersion(config.EngineName, appId);
    }

    let version = app.version;
    let uploadParams = app.uploadParameters;
    let uploadUrl = uploadParams.endpointURL;

    console.log(`Checking if ${alias} alias exists for app ${appId}`);
    let aliasExists = await forgeDaClient.getAppBundleAlias(appId, alias);

    if (!aliasExists) {
        console.log(`Creating ${alias} alias for app ${appId}`);
        await forgeDaClient.postAppBundleAlias(appId, alias, version);
    } else {
        console.log(`Updating ${alias} alias for app ${appId}`);
        await forgeDaClient.patchAppBundleAlias(appId, alias, version);
    }

    console.log(`Uploading zip file ${config.LocalAppPackage}...`);
    await utilities.uploadAppBundle(uploadParams.formData, uploadUrl, config.LocalAppPackage);
}

/**
 * Create the activity (or new version of it if it exists)
 */
async function setupActivity() {
    console.log('Setting up activity...');
    console.log('Checking if activity exists...');
    let activityId = config.PartAssemblyActivityId;
    let activities = await forgeDaClient.getActivities();
    let activityExists = false;
    let activityName = `${nickname}.${activityId}+${alias}`;
    for (let activity of activities) {
        if (activity === activityName) {
            activityExists = true;
            console.log(`Found existing activity ${activityId}`);
        }
    }
    let activity = null;
    let apps = [`${nickname}.${config.AppId}+${alias}`];
    let commandLine = `$(engine.path)\\InventorCoreConsole.exe /i $(args[${config.ReqInputArgName}].path) /al $(apps[${config.AppId}].path) $(args[${config.ParamArgName}].path)`;
    let parameters = {};
    parameters[config.ReqInputArgName] = { verb: 'get' };
    parameters[config.ParamArgName] = { localName: config.ParamFile, verb: 'get' };
    parameters[config.OutputPartArgName] = { zip: false, ondemand: false, optional: true, localName: config.OutputPartFile, verb: 'post' };
    parameters['STL'] = { zip: false, ondemand: false, optional: true, localName: 'Result.stl', verb: 'post' };
    parameters[config.OutputAssemblyArgName] = { zip: false, ondemand: false, optional: true, localName: config.OutputZipAssemblyFile, verb: 'post' };
    parameters[config.OutputImageArgName] = { zip: false, ondemand: false, optional: true, localName: config.OutputImageFile, verb: 'post' };
    if (!activityExists) {
        console.log(`Creating activity ${activityId}...`);
        activity = await forgeDaClient.postActivity(config.PartAssemblyActivityId, config.EngineName, apps, commandLine, null, parameters);
    } else {
        console.log(`Creating new version for activity ${activityId}`);
        activity = await forgeDaClient.postActivityVersion(config.PartAssemblyActivityId, config.EngineName, apps, commandLine, null, parameters);
    }
    let version = activity.version;
    console.log(`Checking if ${alias} alias exists for activity ${activityId}`);
    let activityAliasExists = await forgeDaClient.getActivityAlias(activityId, alias);
    if (!activityAliasExists) {
        console.log(`Creating new ${alias} alias for activity ${activityId}`);
        await forgeDaClient.postActivityAlias(activityId, alias, version);
    } else {
        console.log(`Updating ${alias} alias for activity ${activityId}`);
        await forgeDaClient.patchActivityAlias(activityId, alias, version);
    }
}

/**
 * Create the part workitem
 */
async function createPartWorkItem() {
    console.log('Creating part work item...');
    let activityId = `${nickname}.${config.PartAssemblyActivityId}+${alias}`;
    let arguments = {};
    let signedUrl = await forgeDmClient.createSignedUrl(config.InputBucketId, config.InputPartFile);
    arguments[config.ReqInputArgName] = { url: signedUrl };
    arguments[config.ParamArgName] = { url: 'data:application/json,{"height":"16 in", "width":"10 in"}' };
    arguments[config.OutputPartArgName] = {
        url: `${config.ForgeDMBaseUrl}buckets/${config.OutputBucketId}/objects/${config.OutputPartFile}`,
        verb: 'put',
        headers: {
            Authorization: `Bearer ${forgeDmClient.getToken()}`,
            'Content-type': 'application/octet-stream'
        }
    };
    arguments['STL'] = {
        url: `${config.ForgeDMBaseUrl}buckets/${config.OutputBucketId}/objects/Result.stl`,
        verb: 'put',
        headers: {
            Authorization: `Bearer ${forgeDmClient.getToken()}`,
            'Content-type': 'application/octet-stream'
        }
    };
    arguments['onComplete'] = {
        verb: 'post',
        url: 'https://dev-api.factoryfour.com/rules/hooks/5bd0d81e17e9d720977de2e8/run'
    };
    let workItemId = await forgeDaClient.postWorkItem(activityId, arguments);
    let result = await forgeDaClient.waitForWorkItem(workItemId);
    if (result.status !== 'success') {
        console.log(`Work item failed. Writing report log to: ${config.ErrorReport}`);
        await utilities.downloadToDocs(result.reportUrl, config.ErrorReport);
        return;
    }

    console.log(`Writing report log to: ${config.partReport}`);
    await utilities.downloadToDocs(result.reportUrl, config.partReport);
    let outputDownloadUrl = await forgeDmClient.createSignedUrl(config.OutputBucketId, config.OutputPartFile);
    await utilities.downloadToDocs(outputDownloadUrl, config.OutputPartFile);
    outputDownloadUrl = await forgeDmClient.createSignedUrl(config.OutputBucketId, 'Result.stl');
    await utilities.downloadToDocs(outputDownloadUrl, 'Result.stl');
}

/**
 * Create the assembly workitem
 */
async function createAssemblyWorkItem() {
    console.log('Creating assembly work item...');
    let activityId = `${nickname}.${config.PartAssemblyActivityId}+${alias}`;
    let signedUrl = await forgeDmClient.createSignedUrl(config.InputBucketId, config.InputAssemblyZipFile);
    let arguments = {};
    arguments[config.ReqInputArgName] = {
        url: signedUrl,
        zip: false,
        pathInZip: config.InputTopLevelAssembly,
        localName: 'Assy'
    };
    arguments[config.ParamArgName] = { url: 'data:application/json,{"handleOffset":"9 in", "height":"16 in"}' };
    arguments[config.OutputAssemblyArgName] = {
        url: `${config.ForgeDMBaseUrl}buckets/${config.OutputBucketId}/objects/${config.OutputZipAssemblyFile}`,
        verb: 'put',
        headers: {
            Authorization: `Bearer ${forgeDmClient.getToken()}`,
            'Content-type': 'application/octet-stream'
        }
    };
    let workItemId = await forgeDaClient.postWorkItem(activityId, arguments);
    let result = await forgeDaClient.waitForWorkItem(workItemId);
    if (result.status !== 'success') {
        console.log(`Work item failed. Writing report log to: ${config.ErrorReport}`);
        await utilities.downloadToDocs(result.reportUrl, config.ErrorReport);
        return;
    }

    console.log(`Writing report log to: ${config.partReport}`);
    await utilities.downloadToDocs(result.reportUrl, config.assemblyReport);
    let outputDownloadUrl = await forgeDmClient.createSignedUrl(config.OutputBucketId, config.OutputZipAssemblyFile);
    await utilities.downloadToDocs(outputDownloadUrl, config.OutputZipAssemblyFile);
}
