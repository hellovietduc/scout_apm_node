"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const PATHS = require("./paths");
exports.FILE_PATHS = PATHS;
exports.APP_META = {
    framework: "express",
    language: "nodejs",
};
exports.RESPONSES = {
    V1: {
        REGISTER: {
            COMPLETE: '{"Register":{"id":null,"result":"Success"}}',
            PARTIAL: '{"Register":{"id":null,"',
            CHUNKED: ['{"Register":{"id":null,"', 'result":"Success"}}'],
        },
    },
};
exports.SQL_QUERIES = {
    SELECT_TIME: "SELECT NOW();",
    CREATE_STRING_KV_TABLE: `
CREATE TABLE kv(
  id int GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  key text NOT NULL,
  value text NOT NULL
);`,
    INSERT_STRING_KV_TABLE: "INSERT INTO kv (key, value) VALUES ($1, $2)",
};