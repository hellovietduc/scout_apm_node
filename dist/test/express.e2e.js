"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require("tape");
const TestUtil = require("./util");
const Constants = require("../lib/constants");
const request = require("supertest");
const express_1 = require("../lib/express");
const types_1 = require("../lib/types");
const scout_1 = require("../lib/scout");
const lib_1 = require("../lib");
const getNanoTime = require("nano-time");
const BigNumber = require("big-number");
const global_1 = require("../lib/global");
const TEST_OPTS = { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS };
lib_1.setupRequireIntegrations(["pug", "ejs", "mustache"]);
test("Simple operation", t => {
    // Create an application and setup scout middleware
    const app = TestUtil.simpleExpressApp(express_1.scoutMiddleware({
        config: types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
        }),
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    let scout;
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => {
        if (!app.scout) {
            throw new Error("Scout was not added to app object");
        }
        t.assert(app.scout, "scout instance was added to the app object");
        t.assert(app.scout.hasAgent(), "the scout instance has an agent");
        scout = app.scout;
    })
        // Set up listeners and make another request to ensure that scout is working
        .then(() => {
        // Create a listener to watch for the request finished event
        const listener = () => {
            t.pass("received RequestFinished agent event");
            // Remove listener
            scout.removeListener(types_1.AgentEvent.RequestFinished, listener);
            TestUtil.shutdownScout(t, scout)
                .catch(err => TestUtil.shutdownScout(t, scout, err));
        };
        // Set up listener on the agent
        scout.on(types_1.AgentEvent.RequestFinished, listener);
        // Make another request to the application
        request(app)
            .get("/")
            .expect("Content-Type", /json/)
            .expect(200)
            .then(() => t.comment("sent first request"));
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
test("Dynamic segment routes (uses global instance)", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    // Create an application and setup scout middleware
    const app = TestUtil.simpleDynamicSegmentExpressApp(express_1.scoutMiddleware({
        config: types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
        }),
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    let scout;
    const expectedRootSpan = "Controller/GET /dynamic/:segment";
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .then(res => {
        if (!app.scout) {
            throw new Error("Scout was not added to app object");
        }
        t.assert(app.scout, "scout instance was added to the app object");
        t.assert(app.scout.hasAgent(), "the scout instance has an agent");
        scout = app.scout;
    })
        // Set up listeners and make another request to ensure that scout is working
        .then(() => {
        // Create a listener to watch for the request finished event
        const listener = (message) => {
            // Ignore requests that are sent that aren't span starts
            if (!message || message.type !== types_1.AgentRequestType.V1StartSpan) {
                return;
            }
            // Skip requests that aren't the span we expect ( the initial GET / will trigger this)
            const msg = message;
            if (msg.operation !== expectedRootSpan) {
                return;
            }
            // Ensure that the span is what we expect
            t.equals(msg.operation, expectedRootSpan, `root span operation is correct [${msg.operation}]`);
            // Remove agent, pass test
            scout.removeListener(types_1.AgentEvent.RequestSent, listener);
            // Wait a little while for request to finish up, then shutdown
            TestUtil.shutdownScout(t, scout)
                .catch(err => TestUtil.shutdownScout(t, scout, err));
        };
        // Set up listener on the agent
        scout.on(types_1.AgentEvent.RequestSent, listener);
        // Make another request to the application
        request(app)
            .get("/dynamic/1234")
            .expect("Content-Type", /json/)
            .expect(200)
            .then(() => t.comment("sent second request"))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    })
        .catch(t.end);
});
test("Application which errors (uses global scout instance)", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    // Create an application and setup scout middleware
    const app = TestUtil.simpleErrorApp(express_1.scoutMiddleware({
        config: types_1.buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
        }),
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    let scout;
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect(500)
        .then(res => {
        if (!app.scout) {
            throw new Error("Scout was not added to app object");
        }
        t.assert(app.scout, "scout instance was added to the app object");
        t.assert(app.scout.hasAgent(), "the scout instance has an agent");
        scout = app.scout;
    })
        .then(() => TestUtil.shutdownScout(t, scout))
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
test("express ignores a path (exact path, with dynamic segments)", TEST_OPTS, t => {
    const path = "/dynamic/:segment";
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        ignore: [path],
    }));
    // Create an application and setup scout middleware
    const app = TestUtil.simpleDynamicSegmentExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    // Set up a listener that should *not* fire
    const listener = (ignoredPath) => {
        t.equals(path, ignoredPath, `IgnoredPathDetected event was emitted with the expected path [${path}]`);
        scout.removeListener(types_1.ScoutEvent.IgnoredPathDetected, listener);
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.IgnoredPathDetected, listener);
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/dynamic/1234")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
test("express ignores a path (exact path, static)", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    const path = "/";
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        ignore: [path],
    }));
    // Create an application and setup scout middleware
    const app = TestUtil.simpleDynamicSegmentExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    // Set up a listener that should *not* fire
    const listener = (ignoredPath) => {
        t.equals(path, ignoredPath, `IgnoredPathDetected event was emitted with the expected path [${path}]`);
        scout.removeListener(types_1.ScoutEvent.IgnoredPathDetected, listener);
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.IgnoredPathDetected, listener);
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
test("express ignores a path (prefix, with dynamic segments)", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    const path = "/dynamic/:segment";
    const prefix = "/dynamic";
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        ignore: [prefix],
    }));
    // Create an application and setup scout middleware
    const app = TestUtil.simpleDynamicSegmentExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    // Set up a listener that should *not* fire
    const listener = (ignoredPath) => {
        // The trace was ignored due to a prefix match so
        t.equals(path, ignoredPath, `IgnoredPathDetected event was emitted with the expected path [${path}]`);
        scout.removeListener(types_1.ScoutEvent.IgnoredPathDetected, listener);
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.IgnoredPathDetected, listener);
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .get("/dynamic/1234")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
test("express ignores a path (prefix, static)", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    const path = "/echo-by-post";
    const prefix = "/echo";
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        ignore: [prefix],
    }));
    // Create an application and setup scout middleware
    const app = TestUtil.simpleDynamicSegmentExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    // Set up a listener that should *not* fire
    const listener = (ignoredPath) => {
        // The trace was ignored due to a prefix match so
        t.equals(path, ignoredPath, `IgnoredPathDetected event was emitted with the expected path [${path}]`);
        scout.removeListener(types_1.ScoutEvent.IgnoredPathDetected, listener);
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.IgnoredPathDetected, listener);
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .post(path)
        .send("hello")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
test("URI params are filtered", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Create an application and setup scout middleware
    const app = TestUtil.simpleDynamicSegmentExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    // Set up a listener that should *not* fire
    const listener = (data) => {
        const pathTag = data.request.getTags().find(t => t.name === Constants.SCOUT_PATH_TAG);
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Ensure path tag was specified
        if (!pathTag) {
            TestUtil.shutdownScout(t, scout, new Error(`Context with name [${Constants.SCOUT_PATH_TAG}] missing`));
            return;
        }
        // Check that the tag has the right value
        t.assert(pathTag, "Context with the path was present on the request");
        t.equals(pathTag.value, `/echo-by-post?password=${Constants.DEFAULT_PARAM_SCRUB_REPLACEMENT}`, `The path tag value is correct [${pathTag.value}]`);
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .post("/echo-by-post?password=test")
        .send("hello")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
test("URI filtered down to path", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
        uriReporting: types_1.URIReportingLevel.Path,
    }));
    // Create an application and setup scout middleware
    const app = TestUtil.simpleDynamicSegmentExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    // Set up a listener that should *not* fire
    const listener = (data) => {
        const pathTag = data.request.getTags().find(t => t.name === Constants.SCOUT_PATH_TAG);
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Ensure path tag was specified
        if (!pathTag) {
            TestUtil.shutdownScout(t, scout, new Error(`Context with name [${Constants.SCOUT_PATH_TAG}] missing`));
            return;
        }
        // Check that the tag has the right value
        t.assert(pathTag, "Context with the path was present on the request");
        t.equals(pathTag.value, "/echo-by-post", `The path tag value is correct [${pathTag.value}]`);
        TestUtil.shutdownScout(t, scout)
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    // Send a request to the application (which should trigger setup of scout)
    request(app)
        .post("/echo-by-post?password=test")
        .send("hello")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/82
test("Pug integration works", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Create an application that's set up to use pug templating
    const app = TestUtil.simpleHTML5BoilerplateApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }), "pug");
    // Set up a listener that should fire when the request is finished
    const listener = (data) => {
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the template render span from the request
        const requestSpans = data.request.getChildSpansSync();
        // The top level controller should be present
        const controllerSpan = requestSpans.find(s => s.operation.includes("Controller/"));
        t.assert(controllerSpan, "controller span was present on request");
        if (!controllerSpan) {
            t.fail("no controller span present on request");
            throw new Error("No controller span");
        }
        // The inner spans for the controller should contain a template rendering span
        const innerSpans = controllerSpan.getChildSpansSync();
        const renderSpan = innerSpans.find(s => s.operation === types_1.ScoutSpanOperation.TemplateRender);
        t.assert(renderSpan, "template render span was present on request");
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No render span");
        }
        t.assert(renderSpan.getContextValue(types_1.ScoutContextName.Name), "template name context is present");
        // Shutdown the scout instance
        TestUtil.shutdownScout(t, scout);
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    return request(app)
        .get("/")
        .expect("Content-Type", /html/)
        .expect(200)
        .then(res => {
        t.assert(res.text.includes("<title>dynamic</title>"), "dynamic template was rendered by express");
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/82
test("ejs integration works", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Create an application that's set up to use ejs templating
    const app = TestUtil.simpleHTML5BoilerplateApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }), "ejs");
    // Set up a listener that should fire when the request is finished
    const listener = (data) => {
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the template render span from the request
        const requestSpans = data.request.getChildSpansSync();
        // The top level controller should be present
        const controllerSpan = requestSpans.find(s => s.operation.includes("Controller/"));
        t.assert(controllerSpan, "controller span was present on request");
        if (!controllerSpan) {
            t.fail("no controller span present on request");
            throw new Error("No controller span");
        }
        // The inner spans for the controller should contain a template rendering span
        const innerSpans = controllerSpan.getChildSpansSync();
        const renderSpan = innerSpans.find(s => s.operation === types_1.ScoutSpanOperation.TemplateRender);
        t.assert(renderSpan, "ejs template render span was present on request");
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No render span");
        }
        t.assert(renderSpan.getContextValue(types_1.ScoutContextName.Name), "template name context is present");
        // Shutdown and close scout
        TestUtil.shutdownScout(t, scout);
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    return request(app)
        .get("/")
        .expect("Content-Type", /html/)
        .expect(200)
        .then(res => {
        t.assert(res.text.includes("<title>dynamic</title>"), "ejs template was rendered by express");
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/82
test("mustache integration works", { timeout: TestUtil.EXPRESS_TEST_TIMEOUT_MS }, t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Create an application that's set up to use mustache templating
    const app = TestUtil.simpleHTML5BoilerplateApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }), "mustache");
    // Set up a listener that should fire when the request is finished
    const listener = (data) => {
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the template render span from the request
        const requestSpans = data.request.getChildSpansSync();
        // The top level controller should be present
        const controllerSpan = requestSpans.find(s => s.operation.includes("Controller/"));
        t.assert(controllerSpan, "template controller span was present on request");
        if (!controllerSpan) {
            t.fail("no controller span present on request");
            throw new Error("No controller span");
        }
        // The inner spans for the controller should contain a template rendering span
        const innerSpans = controllerSpan.getChildSpansSync();
        const renderSpan = innerSpans.find(s => s.operation === types_1.ScoutSpanOperation.TemplateRender);
        t.assert(renderSpan, "template render span was present on request");
        if (!renderSpan) {
            t.fail("no render span present on request");
            throw new Error("No render span");
        }
        t.assert(renderSpan.getContextValue(types_1.ScoutContextName.Name), "template name context is present");
        // Shutdown and close scout
        TestUtil.shutdownScout(t, scout);
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    return request(app)
        .get("/")
        .expect("Content-Type", /html/)
        .expect(200)
        .then(res => {
        t.assert(res.text.includes("<title>dynamic</title>"), "mustache template was rendered by express");
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/129
test("Nested spans on the top level controller have parent ID specified", t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Create an application that's set up to do a simple instrumentation
    const app = TestUtil.simpleInstrumentApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    // Set up a listener that should fire when the request is finished
    const listener = (data) => {
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        // Look up the template render span from the request
        const requestSpans = data.request.getChildSpansSync();
        // The top level controller should be present
        const controllerSpan = requestSpans.find(s => s.operation.includes("Controller/"));
        if (!controllerSpan) {
            t.fail("no controller span present on request");
            throw new Error("No controller span");
        }
        // The inner spans for the controller should contain a template rendering span
        const innerSpans = controllerSpan.getChildSpansSync();
        const internalOpSpan = innerSpans.find(s => s.operation === "internal-op");
        if (!internalOpSpan) {
            t.fail("no internal op present on request");
            throw new Error("No render span");
        }
        if (!internalOpSpan.parentId) {
            t.fail("no parent on internal op");
            throw new Error("No parent on internal op span");
        }
        // the internalOpSpan should have the correct parent
        t.equals(internalOpSpan.parentId, controllerSpan.id, "the internal op span's parent is the controller span");
        // Shutdown and close scout
        TestUtil.shutdownScout(t, scout);
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    return request(app)
        .get("/")
        .expect("Content-Type", /json/)
        .expect(200)
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/150
test("Unknown routes should not be recorded", t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Create an application that's set up to do a simple instrumentation
    const app = TestUtil.simpleExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    // Set up a listener that should fire when the request is finished
    const listener = (url) => {
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.UnknownRequestPathSkipped, listener);
        t.pass("UnknownRequestPathSkipped event was fired");
        t.equals(url, "/nope", "url matches");
        // Shutdown and close scout
        TestUtil.shutdownScout(t, scout);
    };
    scout.on(types_1.ScoutEvent.UnknownRequestPathSkipped, listener);
    scout
        .setup()
        .then(() => {
        return request(app)
            .get("/nope")
            .expect("Content-Type", /html/)
            .expect(404)
            .then(() => t.pass("unknown route was visited"));
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// https://github.com/scoutapp/scout_apm_node/issues/68
test("Request queue time should be recorded", t => {
    const scout = new scout_1.Scout(types_1.buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));
    // Create an application that's set up to do a simple instrumentation
    const app = TestUtil.simpleExpressApp(express_1.scoutMiddleware({
        scout,
        requestTimeoutMs: 0,
        waitForScoutSetup: true,
    }));
    let preRequestTimeNS;
    // Set up a listener that should fire when the request is finished
    const listener = (data) => {
        // Remove listener since this should fire once
        scout.removeListener(types_1.ScoutEvent.RequestSent, listener);
        const nowInListenerNS = new BigNumber(getNanoTime());
        const queueTimeNSRaw = data.request.getContextValue(types_1.ScoutContextName.QueueTimeNS);
        t.assert(queueTimeNSRaw, "duration in NS is present is valid BigNumber");
        const queueTimeNS = new BigNumber(queueTimeNSRaw);
        const totalRequestTimeNS = nowInListenerNS.minus(preRequestTimeNS);
        t.assert(queueTimeNS.gte(0), "positive queueTimeNS is bigger than 0");
        t.assert(queueTimeNS.lte(totalRequestTimeNS), `request queue duration (${queueTimeNS}) is less than time of request (${totalRequestTimeNS.toString()})`);
        // Shutdown and close scout
        TestUtil.shutdownScout(t, scout);
    };
    scout.on(types_1.ScoutEvent.RequestSent, listener);
    scout
        .setup()
        .then(() => {
        // Take the time before making the request
        preRequestTimeNS = new BigNumber(getNanoTime());
        // Send a request that has recognized headers set
        return request(app)
            .get("/")
            .set("X-QUEUE-START", `t=${preRequestTimeNS.toString()}`)
            .expect("Content-Type", /json/)
            .expect(200)
            .then(() => t.pass("root route was visited"));
    })
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
// Cleanup the global isntance(s) that get created
test("Shutdown the global instance", t => {
    const inst = global_1.getActiveGlobalScoutInstance();
    if (inst) {
        return TestUtil.shutdownScout(t, inst);
    }
    t.end();
});
