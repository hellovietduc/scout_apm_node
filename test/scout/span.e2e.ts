import * as test from "tape";

import {
    Scout,
    ScoutRequest,
    ScoutSpan,
    ScoutEventRequestSentData,
} from "../../lib/scout";

import {
    BaseAgentRequest,
    AgentRequestType,
    AgentEvent,
    ApplicationEventType,
    ScoutContextName,
    JSONValue,
    ScoutEvent,
    buildScoutConfiguration,
    consoleLogFn,
} from "../../lib/types";
import { V1ApplicationEvent } from "../../lib/protocol/v1/requests";

import { pathExists, remove } from "fs-extra";

import * as TestUtil from "../util";
import * as Constants from "../../lib/constants";

// https://github.com/scoutapp/scout_apm_node/issues/76
test("spans should have traces attached", t => {
    const scout = new Scout(
        buildScoutConfiguration({
            allowShutdown: true,
            monitor: true,
            logFilePath: "/tmp/scout.log",
        }),
        { slowRequestThresholdMs: 50 }, // reduce the threshold to ensure that trace gets generated
    );

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        const request = data.request;

        scout.removeListener(ScoutEvent.RequestSent, listener);

        data.request
            .getChildSpans()
            .then(spans => {
                t.equals(spans.length, 1, "one span was present");
                const stack = spans[0].getContextValue(ScoutContextName.Traceback);
                t.assert(stack !== null && typeof stack !== "undefined", "traceback context is present on span");
                const scoutTrace = (stack as JSONValue[]).find((s: any) => s.file.includes("scout_apm_node"));
                t.equals(scoutTrace, undefined, "no scout APM traces");
            })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the first & second request
        .then(() => scout.transaction("Controller/test-span-trace", finishRequest => {
            return scout.instrument("test-span-trace", stopSpan => {
                return TestUtil.waitMs(Constants.DEFAULT_SLOW_REQUEST_THRESHOLD_MS)
                    .then(() => t.pass("span ran after slow request threshold"))
                    .then(() => finishRequest());
            });
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/107
test("spans within the threshold should not have traces attached", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        const request = data.request;

        scout.removeListener(ScoutEvent.RequestSent, listener);

        data.request
            .getChildSpans()
            .then(spans => {
                t.equals(spans.length, 1, "one span was present");
                const stack = spans[0].getContextValue(ScoutContextName.Traceback);
                t.notOk(stack, "traceback context is not present on span");
            })
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the first & second request
        .then(() => scout.transaction("Controller/test-span-trace", finishRequest => {
            return scout.instrument("test-span-trace", stopSpan => {
                return t.pass("span ran (without delay)");
            })
                .then(() => finishRequest());
        }))
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});

// https://github.com/scoutapp/scout_apm_node/issues/186
test("transactions created automatically if not present", t => {
    const scout = new Scout(buildScoutConfiguration({
        allowShutdown: true,
        monitor: true,
    }));

    // Set up a listener for the scout request that gets sent
    const listener = (data: ScoutEventRequestSentData) => {
        const request = data.request;
        scout.removeListener(ScoutEvent.RequestSent, listener);

        // A request (transaction) should have been sent
        t.pass("a request was sent");

        // Ensure that only one span was present
        data.request
            .getChildSpans()
            .then(spans => t.equals(spans.length, 1, "one span was present"))
            .then(() => TestUtil.shutdownScout(t, scout))
            .catch(err => TestUtil.shutdownScout(t, scout, err));
    };

    // Set up listener on the agent
    scout.on(ScoutEvent.RequestSent, listener);

    scout
        .setup()
    // Create the first & second request
        .then(() => {
            return scout.instrument("test-span-trace", stopSpan => {
                t.pass("span ran (without delay)");
                stopSpan();
            });
        })
    // Teardown and end test
        .catch(err => TestUtil.shutdownScout(t, scout, err));
});
