const rp = require('request-promise');
const delay = require('delay');
const credentials = require('../config/credentials.json');
const config = require('../config/config.json');
const designAutomationBaseUrl = config.InventorIOBaseUrl;
const { URL } = require('url');
const fs = require('fs');

class ForgeClient {
    constructor(scopes) {
        this.scopes = scopes;
    }

    async init() {
        let baseUrl = new URL(designAutomationBaseUrl);
        let authUrl = `${baseUrl.protocol}//${baseUrl.host}/authentication/v1/authenticate`;
        let body = `client_id=${credentials.ConsumerKey}&client_secret=${credentials.ConsumerSecret}&grant_type=client_credentials&scope=${this.scopes}`;
        let headers = { 'content-type': 'application/x-www-form-urlencoded' };
        let response = await this.request(authUrl, 'POST', headers, body);
        this.twoLeggedToken = JSON.parse(response).access_token;
    }

    getToken() {
        return this.twoLeggedToken;
    }

    async request(url, method, headers, body) {
        if (!headers) {
            headers = {
                'Authorization': 'Bearer ' + this.twoLeggedToken,
                'content-type': 'application/json'
            };
        }
        let options = {
            uri: url,
            method: method,
            headers: headers,
        };
        if (body) {
            options.body = body;
        }
        return await rp(options);
    }
}

class ForgeDmClient extends ForgeClient {
    constructor() {
        super('bucket:create bucket:read data:read data:write data:create');
    }

    async bucketExists(bucketName) {
        let url = `${config.ForgeDMBaseUrl}buckets/${bucketName}/details`;
        try {
            await this.request(url, 'GET');
            return true;
        }
        catch (err) {
            if (err.statusCode === 404) {
                return false;
            } else if (err.statusCode === 403) {
                throw new Error('InputBucketId and OutputBucketId in config.json must be unique (not created by another forge application)');
            } else {
                throw err;
            }
        }
    }

    async createBucket(bucketName, policy) {
        if (!policy) {
            policy = 'persistent'; // see https://developer.autodesk.com/en/docs/data/v2/overview/retention-policy/ for options
        }
        let url = `${config.ForgeDMBaseUrl}buckets`;
        let body = { 'bucketKey': bucketName, 'policyKey': policy };
        await this.request(url, 'POST', null, JSON.stringify(body));
    }

    async objectExists(bucketKey, objectName) {
        let url = `${config.ForgeDMBaseUrl}buckets/${bucketKey}/objects/${objectName}/details`;
        try {
            await this.request(url, 'GET');
            return true;
        }
        catch (err) {
            if (err.statusCode === 404) {
                return false;
            } else if (err.statusCode === 403) {
                throw new Error('InputBucketId and OutputBucketId in config.json must be unique (not created by another forge application)');
            } else {
                throw err;
            }
        }
    }

    async uploadBucketObject(filePath, bucketName, fileName) {
        let url = `${config.ForgeDMBaseUrl}/buckets/${bucketName}/objects/${fileName}`;
        let headers = {
            'Authorization': 'Bearer ' + this.twoLeggedToken,
            'content-type': 'application/octet-stream'
        };
        try {
            await this.request(url, 'PUT', headers, fs.createReadStream(filePath));
            return true;
        } catch (err) {
            console.log(err);
            return false;
        }
    }

    async createSignedUrl(bucketKey, objectName) {
        let url = `${config.ForgeDMBaseUrl}/buckets/${bucketKey}/objects/${objectName}/signed`;
        let body = {
            'minutesExpiration': 45,
            'singleUse': true
        };
        try {
            const response = await this.request(url, 'POST', null, JSON.stringify(body));
            return JSON.parse(response).signedUrl;
        } catch (err) {
            console.log(err);
        }
    }
}

class ForgeDaClient extends ForgeClient {
    constructor() {
        super('code:all');
    }

    async getNickname() {
        let url = designAutomationBaseUrl + 'forgeapps/me';
        let response = await this.request(url, 'GET');
        return response;
    }

    async getAppBundles() {
        let url = designAutomationBaseUrl + 'appbundles';
        let response = await this.request(url, 'GET');
        return JSON.parse(response).data;
    }

    async postAppBundle(engine, id) {
        let url = designAutomationBaseUrl + 'appbundles';
        let body = {
            'engine': engine,
            'id': id
        };
        let response = await this.request(url, 'POST', null, JSON.stringify(body));
        return JSON.parse(response);
    }

    async postAppBundleVersion(engine, id) {
        let url = `${designAutomationBaseUrl}appbundles/${id}/versions`;
        let body = { 'engine': engine };
        let response = await this.request(url, 'POST', null, JSON.stringify(body));
        return JSON.parse(response);
    }

    async getAppBundleAlias(id, alias) {
        let url = `${designAutomationBaseUrl}appbundles/${id}/aliases/${alias}`;
        try {
            await this.request(url, 'GET');
            return true;
        } catch (error) {
            if (error.name === 'StatusCodeError' && error.statusCode === 404) {
                return false;
            } else {
                throw error;
            }
        }
    }

    async postAppBundleAlias(id, alias, version) {
        let url = `${designAutomationBaseUrl}appbundles/${id}/aliases`;
        let body = {
            'id': alias,
            'version': version
        };
        await this.request(url, 'POST', null, JSON.stringify(body));
    }

    async patchAppBundleAlias(id, alias, version) {
        let url = `${designAutomationBaseUrl}appbundles/${id}/aliases/${alias}`;
        let body = { 'version': version };
        await this.request(url, 'PATCH', null, JSON.stringify(body));
    }

    async getActivities() {
        let url = `${designAutomationBaseUrl}activities`;
        let response = await this.request(url, 'GET');
        return JSON.parse(response).data;
    }

    async postActivity(id, engine, apps, commandLine, settings, parameters) {
        let url = designAutomationBaseUrl + 'activities';
        let body = {};
        body.id = id;
        body.engine = engine;
        body.apps = apps;
        body.commandLine = commandLine;
        body.settings = settings;
        body.parameters = parameters;
        let response = await this.request(url, 'POST', null, JSON.stringify(body));
        return JSON.parse(response);
    }

    async postActivityVersion(id, engine, apps, commandLine, settings, parameters) {
        let url = `${designAutomationBaseUrl}activities/${id}/versions`;
        let body = {};
        body.engine = engine;
        body.apps = apps;
        body.commandLine = commandLine;
        body.settings = settings;
        body.parameters = parameters;
        let response = await this.request(url, 'POST', null, JSON.stringify(body));
        return JSON.parse(response);
    }

    async getActivityAlias(id, alias) {
        let url = `${designAutomationBaseUrl}activities/${id}/aliases/${alias}`;
        try {
            await this.request(url, 'GET', null);
            return true;
        } catch (error) {
            if (error.name === 'StatusCodeError' && error.statusCode === 404) {
                return false;
            } else {
                throw error;
            }
        }
    }

    async postActivityAlias(id, alias, version) {
        const url = `${designAutomationBaseUrl}activities/${id}/aliases`;
        const body = {
            'id': alias,
            'version': version
        };
        await this.request(url, 'POST', null, JSON.stringify(body));
    }

    async patchActivityAlias(id, alias, version) {
        let url = `${designAutomationBaseUrl}activities/${id}/aliases/${alias}`;
        let body = { 'version': version };
        await this.request(url, 'PATCH', null, JSON.stringify(body));
    }

    async postWorkItem(activityId, args) {
        let url = `${designAutomationBaseUrl}workitems`;
        let body = {
            activityId: activityId,
            arguments: args
        };
        try {
            let response = await this.request(url, 'POST', null, JSON.stringify(body));
            return JSON.parse(response).id;
        } catch (err) {
            console.log(err);
        }
    }


    async waitForWorkItem(id) {
        console.log('waiting for ' + id);
        let url = `${designAutomationBaseUrl}workitems/${id}`;
        let headers = { 'Authorization': 'Bearer ' + this.twoLeggedToken };
        let status = '';
        let responseObj = null;
        while (true) {
            try {
                let response = await this.request(url, 'GET', headers);
                responseObj = JSON.parse(response);
                status = responseObj.status;
                console.log('work item status: ' + status);
                if (status === 'inprogress' || status === 'pending') {
                    delay(2000);
                } else {
                    break;
                }
            } catch (err) {
                console.log(err);
                status = 'Error';
                break;
            }
        }

        return { status: status, reportUrl: responseObj.reportUrl };
    }
}

module.exports = {
    ForgeDmClient: ForgeDmClient,
    ForgeDaClient: ForgeDaClient
};
