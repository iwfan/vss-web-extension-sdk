// Copyright (C) Microsoft Corporation. All rights reserved.

var VSS;
(function (VSS) {
    // W A R N I N G: if VssSDKVersion changes, the VSS WEB SDK demand resolver needs to be updated with the new version
    VSS.VssSDKVersion = 2.0;
    VSS.VssSDKRestVersion = "4.1";
    var bodyElement;
    var themeElement;
    var webContext;
    var hostPageContext;
    var extensionContext;
    var initialConfiguration;
    var initialContribution;
    var initOptions;
    var loaderConfigured = false;
    var usingPlatformScripts;
    var usingPlatformStyles;
    var isReady = false;
    var readyCallbacks;
    var parentChannel = XDM.XDMChannelManager.get().addChannel(window.parent);
    var shimmedLocalStorage;
    var hostReadyForShimUpdates = false;
    var Storage = (function () {
        var changeCallback;
        function invokeChangeCallback() {
            if (changeCallback) {
                changeCallback.call(this);
            }
        }
        function Storage(changeCallback) {
        }
        Object.defineProperties(Storage.prototype, {
            getItem: {
                get: function () {
                    return function (key) {
                        var item = this["" + key];
                        return typeof item === "undefined" ? null : item;
                    };
                }
            },
            setItem: {
                get: function () {
                    return function (key, value) {
                        key = "" + key;
                        var existingValue = this[key];
                        var newValue = "" + value;
                        if (existingValue !== newValue) {
                            this[key] = newValue;
                            invokeChangeCallback();
                        }
                    };
                }
            },
            removeItem: {
                get: function () {
                    return function (key) {
                        key = "" + key;
                        if (typeof this[key] !== "undefined") {
                            delete this[key];
                            invokeChangeCallback();
                        }
                    };
                }
            },
            clear: {
                get: function () {
                    return function () {
                        var keys = Object.keys(this);
                        if (keys.length > 0) {
                            for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
                                var key = keys_1[_i];
                                delete this[key];
                            }
                            invokeChangeCallback();
                        }
                    };
                }
            },
            key: {
                get: function () {
                    return function (index) {
                        return Object.keys(this)[index];
                    };
                }
            },
            length: {
                get: function () {
                    return Object.keys(this).length;
                }
            }
        });
        return Storage;
    }());
    function shimSandboxedProperties() {
        var updateSettingsTimeout;
        function updateShimmedStorageCallback() {
            // Talk to the host frame on a 50 ms delay in order to batch storage/cookie updates
            if (!updateSettingsTimeout) {
                updateSettingsTimeout = setTimeout(function () {
                    updateSettingsTimeout = 0;
                    updateHostSandboxedStorage();
                }, 50);
            }
        }
        // Override document.cookie if it is not available
        var hasCookieSupport = false;
        try {
            hasCookieSupport = typeof document.cookie === "string";
        }
        catch (ex) {
        }
        if (!hasCookieSupport) {
            Object.defineProperty(Document.prototype, "cookie", {
                get: function () {
                    return "";
                },
                set: function (value) {
                }
            });
        }
        // Override browser storage
        var hasLocalStorage = false;
        try {
            hasLocalStorage = !!window.localStorage;
        }
        catch (ex) {
        }
        if (!hasLocalStorage) {
            delete window.localStorage;
            shimmedLocalStorage = new Storage(updateShimmedStorageCallback);
            Object.defineProperty(window, "localStorage", { value: shimmedLocalStorage });
            delete window.sessionStorage;
            Object.defineProperty(window, "sessionStorage", { value: new Storage() });
        }
    }
    if (!window["__vssNoSandboxShim"]) {
        try {
            shimSandboxedProperties();
        }
        catch (ex) {
            if (window.console && window.console.warn) {
                window.console.warn("Failed to shim support for sandboxed properties: " + ex.message + ". Set \"window.__vssNoSandboxShim = true\" in order to bypass the shim of sandboxed properties.");
            }
        }
    }
    /**
    * Service Ids for core services (to be used in VSS.getService)
    */
    var ServiceIds;
    (function (ServiceIds) {
        /**
        * Service for showing dialogs in the host frame
        * Use: <IHostDialogService>
        */
        ServiceIds.Dialog = "ms.vss-web.dialog-service";
        /**
        * Service for interacting with the host frame's navigation (getting/updating the address/hash, reloading the page, etc.)
        * Use: <IHostNavigationService>
        */
        ServiceIds.Navigation = "ms.vss-web.navigation-service";
        /**
        * Service for interacting with extension data (setting/setting documents and collections)
        * Use: <IExtensionDataService>
        */
        ServiceIds.ExtensionData = "ms.vss-web.data-service";
    })(ServiceIds = VSS.ServiceIds || (VSS.ServiceIds = {}));
    /**
     * Initiates the handshake with the host window.
     *
     * @param options Initialization options for the extension.
     */
    function init(options) {
        initOptions = options || {};
        usingPlatformScripts = initOptions.usePlatformScripts;
        usingPlatformStyles = initOptions.usePlatformStyles;
        // Run this after current execution path is complete - allows objects to get initialized
        window.setTimeout(function () {
            var appHandshakeData = {
                notifyLoadSucceeded: !initOptions.explicitNotifyLoaded,
                extensionReusedCallback: initOptions.extensionReusedCallback,
                vssSDKVersion: VSS.VssSDKVersion,
                applyTheme: initOptions.applyTheme
            };
            parentChannel.invokeRemoteMethod("initialHandshake", "VSS.HostControl", [appHandshakeData]).then(function (handshakeData) {
                hostPageContext = handshakeData.pageContext;
                webContext = hostPageContext.webContext;
                initialConfiguration = handshakeData.initialConfig || {};
                initialContribution = handshakeData.contribution;
                extensionContext = handshakeData.extensionContext;
                if (handshakeData.sandboxedStorage) {
                    var updateNeeded = false;
                    if (shimmedLocalStorage) {
                        if (handshakeData.sandboxedStorage.localStorage) {
                            // Merge host data in with any values already set.
                            var newData = handshakeData.sandboxedStorage.localStorage;
                            // Check for any properties written prior to the initial handshake
                            for (var _i = 0, _a = Object.keys(shimmedLocalStorage); _i < _a.length; _i++) {
                                var key = _a[_i];
                                var value = shimmedLocalStorage.getItem(key);
                                if (value !== newData[key]) {
                                    newData[key] = value;
                                    updateNeeded = true;
                                }
                            }
                            // Update the stored values
                            for (var _b = 0, _c = Object.keys(newData); _b < _c.length; _b++) {
                                var key = _c[_b];
                                shimmedLocalStorage.setItem(key, newData[key]);
                            }
                        }
                        else if (shimmedLocalStorage.length > 0) {
                            updateNeeded = true;
                        }
                    }
                    hostReadyForShimUpdates = true;
                    if (updateNeeded) {
                        // Talk to host frame to issue update
                        updateHostSandboxedStorage();
                    }
                }
                if (handshakeData.themeData) {
                    applyTheme(handshakeData.themeData);
                }
                if (usingPlatformScripts || usingPlatformStyles) {
                    setupAmdLoader();
                }
                else {
                    triggerReady();
                }
            });
        }, 0);
    }
    VSS.init = init;
    function updateHostSandboxedStorage() {
        var storage = {
            localStorage: JSON.stringify(shimmedLocalStorage || {})
        };
        parentChannel.invokeRemoteMethod("updateSandboxedStorage", "VSS.HostControl", [storage]);
    }
    /**
     * Ensures that the AMD loader from the host is configured and fetches a script (AMD) module
     * (and its dependencies). If no callback is supplied, this will still perform an asynchronous
     * fetch of the module (unlike AMD require which returns synchronously). This method has no return value.
     *
     * Usage:
     *
     * VSS.require(["VSS/Controls", "VSS/Controls/Grids"], function(Controls, Grids) {
     *    ...
     * });
     *
     * @param modules A single module path (string) or array of paths (string[])
     * @param callback Method called once the modules have been loaded.
     */
    function require(modules, callback) {
        var modulesArray;
        if (typeof modules === "string") {
            modulesArray = [modules];
        }
        else {
            modulesArray = modules;
        }
        if (!callback) {
            // Generate an empty callback for require
            callback = function () { };
        }
        if (loaderConfigured) {
            // Loader already configured, just issue require
            issueVssRequire(modulesArray, callback);
        }
        else {
            if (!initOptions) {
                init({ usePlatformScripts: true });
            }
            else if (!usingPlatformScripts) {
                usingPlatformScripts = true;
                if (isReady) {
                    // We are in the ready state, but previously not using the loader, so set it up now
                    // which will re-trigger ready
                    isReady = false;
                    setupAmdLoader();
                }
            }
            ready(function () {
                issueVssRequire(modulesArray, callback);
            });
        }
    }
    VSS.require = require;
    function issueVssRequire(modules, callback) {
        if (hostPageContext.diagnostics.bundlingEnabled) {
            window.require(["VSS/Bundling"], function (VSS_Bundling) {
                VSS_Bundling.requireModules(modules).spread(function () {
                    callback.apply(this, arguments);
                });
            });
        }
        else {
            window.require(modules, callback);
        }
    }
    /**
    * Register a callback that gets called once the initial setup/handshake has completed.
    * If the initial setup is already completed, the callback is invoked at the end of the current call stack.
    */
    function ready(callback) {
        if (isReady) {
            window.setTimeout(callback, 0);
        }
        else {
            if (!readyCallbacks) {
                readyCallbacks = [];
            }
            readyCallbacks.push(callback);
        }
    }
    VSS.ready = ready;
    /**
    * Notifies the host that the extension successfully loaded (stop showing the loading indicator)
    */
    function notifyLoadSucceeded() {
        parentChannel.invokeRemoteMethod("notifyLoadSucceeded", "VSS.HostControl");
    }
    VSS.notifyLoadSucceeded = notifyLoadSucceeded;
    /**
    * Notifies the host that the extension failed to load
    */
    function notifyLoadFailed(e) {
        parentChannel.invokeRemoteMethod("notifyLoadFailed", "VSS.HostControl", [e]);
    }
    VSS.notifyLoadFailed = notifyLoadFailed;
    /**
    * Get the web context from the parent host
    */
    function getWebContext() {
        return webContext;
    }
    VSS.getWebContext = getWebContext;
    /**
    * Get the configuration data passed in the initial handshake from the parent frame
    */
    function getConfiguration() {
        return initialConfiguration;
    }
    VSS.getConfiguration = getConfiguration;
    /**
    * Get the context about the extension that owns the content that is being hosted
    */
    function getExtensionContext() {
        return extensionContext;
    }
    VSS.getExtensionContext = getExtensionContext;
    /**
    * Gets the information about the contribution that first caused this extension to load.
    */
    function getContribution() {
        return initialContribution;
    }
    VSS.getContribution = getContribution;
    /**
    * Get a contributed service from the parent host.
    *
    * @param contributionId Full Id of the service contribution to get the instance of
    * @param context Optional context information to use when obtaining the service instance
    */
    function getService(contributionId, context) {
        return getServiceContribution(contributionId).then(function (serviceContribution) {
            if (!context) {
                context = {};
            }
            if (!context["webContext"]) {
                context["webContext"] = getWebContext();
            }
            if (!context["extensionContext"]) {
                context["extensionContext"] = getExtensionContext();
            }
            return serviceContribution.getInstance(serviceContribution.id, context);
        });
    }
    VSS.getService = getService;
    /**
    * Get the contribution with the given contribution id. The returned contribution has a method to get a registered object within that contribution.
    *
    * @param contributionId Id of the contribution to get
    */
    function getServiceContribution(contributionId) {
        var deferred = XDM.createDeferred();
        VSS.ready(function () {
            parentChannel.invokeRemoteMethod("getServiceContribution", "vss.hostManagement", [contributionId]).then(function (contribution) {
                var serviceContribution = contribution;
                serviceContribution.getInstance = function (objectId, context) {
                    return getBackgroundContributionInstance(contribution, objectId, context);
                };
                deferred.resolve(serviceContribution);
            }, deferred.reject);
        });
        return deferred.promise;
    }
    VSS.getServiceContribution = getServiceContribution;
    /**
    * Get contributions that target a given contribution id. The returned contributions have a method to get a registered object within that contribution.
    *
    * @param targetContributionId Contributions that target the contribution with this id will be returned
    */
    function getServiceContributions(targetContributionId) {
        var deferred = XDM.createDeferred();
        VSS.ready(function () {
            parentChannel.invokeRemoteMethod("getContributionsForTarget", "vss.hostManagement", [targetContributionId]).then(function (contributions) {
                var serviceContributions = [];
                contributions.forEach(function (contribution) {
                    var serviceContribution = contribution;
                    serviceContribution.getInstance = function (objectId, context) {
                        return getBackgroundContributionInstance(contribution, objectId, context);
                    };
                    serviceContributions.push(serviceContribution);
                });
                deferred.resolve(serviceContributions);
            }, deferred.reject);
        });
        return deferred.promise;
    }
    VSS.getServiceContributions = getServiceContributions;
    /**
    * Create an instance of a registered object within the given contribution in the host's frame
    *
    * @param contribution The contribution to get an object from
    * @param objectId Optional id of the registered object (the contribution's id property is used by default)
    * @param contextData Optional context to use when getting the object.
    */
    function getBackgroundContributionInstance(contribution, objectId, contextData) {
        var deferred = XDM.createDeferred();
        VSS.ready(function () {
            parentChannel.invokeRemoteMethod("getBackgroundContributionInstance", "vss.hostManagement", [contribution, objectId, contextData]).then(deferred.resolve, deferred.reject);
        });
        return deferred.promise;
    }
    /**
    * Register an object (instance or factory method) that this extension exposes to the host frame.
    *
    * @param instanceId unique id of the registered object
    * @param instance Either: (1) an object instance, or (2) a function that takes optional context data and returns an object instance.
    */
    function register(instanceId, instance) {
        parentChannel.getObjectRegistry().register(instanceId, instance);
    }
    VSS.register = register;
    /**
    * Removes an object that this extension exposed to the host frame.
    *
    * @param instanceId unique id of the registered object
    */
    function unregister(instanceId) {
        parentChannel.getObjectRegistry().unregister(instanceId);
    }
    VSS.unregister = unregister;
    /**
    * Get an instance of an object registered with the given id
    *
    * @param instanceId unique id of the registered object
    * @param contextData Optional context data to pass to the contructor of an object factory method
    */
    function getRegisteredObject(instanceId, contextData) {
        return parentChannel.getObjectRegistry().getInstance(instanceId, contextData);
    }
    VSS.getRegisteredObject = getRegisteredObject;
    /**
    * Fetch an access token which will allow calls to be made to other VSTS services
    */
    function getAccessToken() {
        return parentChannel.invokeRemoteMethod("getAccessToken", "VSS.HostControl");
    }
    VSS.getAccessToken = getAccessToken;
    /**
    * Fetch an token which can be used to identify the current user
    */
    function getAppToken() {
        return parentChannel.invokeRemoteMethod("getAppToken", "VSS.HostControl");
    }
    VSS.getAppToken = getAppToken;
    /**
    * Requests the parent window to resize the container for this extension based on the current extension size.
    *
    * @param width Optional width, defaults to scrollWidth
    * @param height Optional height, defaults to scrollHeight
    */
    function resize(width, height) {
        if (!bodyElement) {
            bodyElement = document.getElementsByTagName("body").item(0);
        }
        var newWidth = typeof width === "number" ? width : bodyElement.scrollWidth;
        var newHeight = typeof height === "number" ? height : bodyElement.scrollHeight;
        parentChannel.invokeRemoteMethod("resize", "VSS.HostControl", [newWidth, newHeight]);
    }
    VSS.resize = resize;
    /**
     * Applies theme variables to the current document
     */
    function applyTheme(themeData) {
        if (!themeElement) {
            themeElement = document.createElement("style");
            themeElement.type = "text/css";
            document.head.appendChild(themeElement);
        }
        var cssVariables = [];
        if (themeData) {
            for (var varName in themeData) {
                cssVariables.push("--" + varName + ": " + themeData[varName]);
            }
        }
        themeElement.innerText = ":root { " + cssVariables.join("; ") + " } body { color: var(--text-primary-color) }";
    }
    VSS.applyTheme = applyTheme;
    function setupAmdLoader() {
        var hostRootUri = getRootUri(hostPageContext.webContext);
        // Place context so that VSS scripts pick it up correctly
        window.__vssPageContext = hostPageContext;
        // MS Ajax config needs to exist before loading MS Ajax library
        window.__cultureInfo = hostPageContext.microsoftAjaxConfig.cultureInfo;
        // Append CSS first
        if (usingPlatformStyles !== false) {
            if (hostPageContext.coreReferences.stylesheets) {
                hostPageContext.coreReferences.stylesheets.forEach(function (stylesheet) {
                    if (stylesheet.isCoreStylesheet) {
                        var cssLink = document.createElement("link");
                        cssLink.href = getAbsoluteUrl(stylesheet.url, hostRootUri);
                        cssLink.rel = "stylesheet";
                        safeAppendToDom(cssLink, "head");
                    }
                });
            }
        }
        if (!usingPlatformScripts) {
            // Just wanted to load CSS, no scripts. Can exit here.
            loaderConfigured = true;
            triggerReady();
            return;
        }
        var scripts = [];
        var anyCoreScriptLoaded = false;
        // Add scripts and loader configuration
        if (hostPageContext.coreReferences.scripts) {
            hostPageContext.coreReferences.scripts.forEach(function (script) {
                if (script.isCoreModule) {
                    var alreadyLoaded = false;
                    var global = window;
                    if (script.identifier === "JQuery") {
                        alreadyLoaded = !!global.jQuery;
                    }
                    else if (script.identifier === "JQueryUI") {
                        alreadyLoaded = !!(global.jQuery && global.jQuery.ui && global.jQuery.ui.version);
                    }
                    else if (script.identifier === "AMDLoader") {
                        alreadyLoaded = typeof global.define === "function" && !!global.define.amd;
                    }
                    if (!alreadyLoaded) {
                        scripts.push({ source: getAbsoluteUrl(script.url, hostRootUri) });
                    }
                    else {
                        anyCoreScriptLoaded = true;
                    }
                }
            });
            if (hostPageContext.coreReferences.coreScriptsBundle && !anyCoreScriptLoaded) {
                // If core scripts bundle exists and no core scripts already loaded by extension,
                // we are free to add core bundle. otherwise, load core scripts individually.
                scripts = [{ source: getAbsoluteUrl(hostPageContext.coreReferences.coreScriptsBundle.url, hostRootUri) }];
            }
            if (hostPageContext.coreReferences.extensionCoreReferences) {
                scripts.push({ source: getAbsoluteUrl(hostPageContext.coreReferences.extensionCoreReferences.url, hostRootUri) });
            }
        }
        // Define a new config for extension loader
        var newConfig = {
            baseUrl: extensionContext.baseUri,
            contributionPaths: null,
            paths: {},
            shim: {}
        };
        // See whether any configuration specified initially. If yes, copy them to new config
        if (initOptions.moduleLoaderConfig) {
            if (initOptions.moduleLoaderConfig.baseUrl) {
                newConfig.baseUrl = initOptions.moduleLoaderConfig.baseUrl;
            }
            // Copy paths
            extendLoaderPaths(initOptions.moduleLoaderConfig, newConfig);
            // Copy shim
            extendLoaderShim(initOptions.moduleLoaderConfig, newConfig);
        }
        // Use some of the host config to support VSSF and TFS platform as well as some 3rd party libraries
        if (hostPageContext.moduleLoaderConfig) {
            // Copy host shim
            extendLoaderShim(hostPageContext.moduleLoaderConfig, newConfig);
            // Add contribution paths to new config
            var contributionPaths = hostPageContext.moduleLoaderConfig.contributionPaths;
            if (contributionPaths) {
                for (var p in contributionPaths) {
                    if (contributionPaths.hasOwnProperty(p) && !newConfig.paths[p]) {
                        // Add the contribution path
                        var contributionPathValue = contributionPaths[p].value;
                        if (!contributionPathValue.match("^https?://")) {
                            newConfig.paths[p] = hostRootUri + contributionPathValue;
                        }
                        else {
                            newConfig.paths[p] = contributionPathValue;
                        }
                        // Look for other path mappings that fall under the contribution path (e.g. "bundles")
                        var configPaths = hostPageContext.moduleLoaderConfig.paths;
                        if (configPaths) {
                            var contributionRoot = p + "/";
                            var rootScriptPath = combinePaths(hostRootUri, hostPageContext.moduleLoaderConfig.baseUrl);
                            for (var pathKey in configPaths) {
                                if (startsWith(pathKey, contributionRoot)) {
                                    var pathValue = configPaths[pathKey];
                                    if (!pathValue.match("^https?://")) {
                                        if (pathValue[0] === "/") {
                                            pathValue = combinePaths(hostRootUri, pathValue);
                                        }
                                        else {
                                            pathValue = combinePaths(rootScriptPath, pathValue);
                                        }
                                    }
                                    newConfig.paths[pathKey] = pathValue;
                                }
                            }
                        }
                    }
                }
            }
        }
        // requireJS public api doesn't support reading the current config, so save it off for use by our internal host control.
        window.__vssModuleLoaderConfig = newConfig;
        scripts.push({ content: "require.config(" + JSON.stringify(newConfig) + ");" });
        addScriptElements(scripts, 0, function () {
            loaderConfigured = true;
            triggerReady();
        });
    }
    function startsWith(rootString, startSubstring) {
        if (rootString && rootString.length >= startSubstring.length) {
            return rootString.substr(0, startSubstring.length).localeCompare(startSubstring) === 0;
        }
        return false;
    }
    function combinePaths(path1, path2) {
        var result = path1 || "";
        if (result[result.length - 1] !== "/") {
            result += "/";
        }
        if (path2) {
            if (path2[0] === "/") {
                result += path2.substr(1);
            }
            else {
                result += path2;
            }
        }
        return result;
    }
    function extendLoaderPaths(source, target, pathTranslator) {
        if (source.paths) {
            if (!target.paths) {
                target.paths = {};
            }
            for (var key in source.paths) {
                if (source.paths.hasOwnProperty(key)) {
                    var value = source.paths[key];
                    if (pathTranslator) {
                        value = pathTranslator(key, source.paths[key]);
                    }
                    if (value) {
                        target.paths[key] = value;
                    }
                }
            }
        }
    }
    function extendLoaderShim(source, target) {
        if (source.shim) {
            if (!target.shim) {
                target.shim = {};
            }
            for (var key in source.shim) {
                if (source.shim.hasOwnProperty(key)) {
                    target.shim[key] = source.shim[key];
                }
            }
        }
    }
    function getRootUri(webContext) {
        var hostContext = (webContext.account || webContext.host);
        var rootUri = hostContext.uri;
        var relativeUri = hostContext.relativeUri;
        if (rootUri && relativeUri) {
            // Ensure both relative and root paths end with a trailing slash before trimming the relative path.
            if (rootUri[rootUri.length - 1] !== "/") {
                rootUri += "/";
            }
            if (relativeUri[relativeUri.length - 1] !== "/") {
                relativeUri += "/";
            }
            rootUri = rootUri.substr(0, rootUri.length - relativeUri.length);
        }
        return rootUri;
    }
    function addScriptElements(scripts, index, callback) {
        var _this = this;
        if (index >= scripts.length) {
            callback.call(this);
            return;
        }
        var scriptTag = document.createElement("script");
        scriptTag.type = "text/javascript";
        if (scripts[index].source) {
            var scriptSource = scripts[index].source;
            scriptTag.src = scriptSource;
            scriptTag.addEventListener("load", function () {
                addScriptElements.call(_this, scripts, index + 1, callback);
            });
            scriptTag.addEventListener("error", function (e) {
                notifyLoadFailed("Failed to load script: " + scriptSource);
            });
            safeAppendToDom(scriptTag, "head");
        }
        else if (scripts[index].content) {
            scriptTag.textContent = scripts[index].content;
            safeAppendToDom(scriptTag, "head");
            addScriptElements.call(this, scripts, index + 1, callback);
        }
    }
    function safeAppendToDom(element, section) {
        var parent = document.getElementsByTagName(section)[0];
        if (!parent) {
            parent = document.createElement(section);
            document.appendChild(parent);
        }
        parent.appendChild(element);
    }
    function getAbsoluteUrl(url, baseUrl) {
        var lcUrl = (url || "").toLowerCase();
        if (lcUrl.substr(0, 2) !== "//" && lcUrl.substr(0, 5) !== "http:" && lcUrl.substr(0, 6) !== "https:") {
            url = baseUrl + (lcUrl[0] === "/" ? "" : "/") + url;
        }
        return url;
    }
    function triggerReady() {
        var _this = this;
        isReady = true;
        if (readyCallbacks) {
            var savedReadyCallbacks = readyCallbacks;
            readyCallbacks = null;
            savedReadyCallbacks.forEach(function (callback) {
                callback.call(_this);
            });
        }
    }
})(VSS || (VSS = {}));
//# sourceMappingURL=VSS.SDK.js.map
