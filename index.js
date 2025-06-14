"use strict";

// version 1.4
const { format } = require("date-fns");
const fastify = require("fastify");
const pino = require("pino");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const Buffer = require("buffer").Buffer;

const TLS_PORT = 23779;
const TLS_HOST = "0.0.0.0";

const API_PORT = process.env.CYNC_API_PORT || 8080;
const API_HOST = "0.0.0.0";

const DEBUG = Boolean(process.env.CYNC_DEBUG);

const options = {
    key: fs.readFileSync("certs/key.pem"),
    cert: fs.readFileSync("certs/cert.pem"),
};

// Function to create a new logger destination
function createLoggerDestination() {
    const currentDate = format(new Date(), "yyyy-MM-dd");
    const logFileName = `/home/cync/Logs/cync/cync_${currentDate}.log`;
    return pino.destination(logFileName);
}

// Function to remove logs older than 5 days
function removeOldLogs() {
    const logDir = "/home/cync/Logs/cync"; // Path to the log directory
    const now = Date.now();
    const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;

    fs.readdir(logDir, (err, files) => {
        if (err) {
            fastifyInstance.log.error(
                `Failed to read log directory: ${err.message}`
            );
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(logDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    fastifyInstance.log.error(
                        `Failed to get stats for file: ${filePath}`
                    );
                    return;
                }

                // Check if the file is older than 5 days
                if (now - stats.mtimeMs > fiveDaysInMs) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            fastifyInstance.log.error(
                                `Failed to delete file: ${filePath}`
                            );
                        } else {
                            fastifyInstance.log.info(
                                `Deleted old log file: ${filePath}`
                            );
                        }
                    });
                }
            });
        });
    });
}
// Run the cleanup function immediately
removeOldLogs();

// Schedule the cleanup function to run daily
setInterval(removeOldLogs, 24 * 60 * 60 * 1000); // Run every 24 hours

// Initialize logger destination
let loggerDestination = createLoggerDestination();

// Use the logger in Fastify
const fastifyInstance = fastify({
    logger: {
        level: "info",
        stream: loggerDestination,
    },
});

// Update logger destination daily
setInterval(() => {
    const newDestination = createLoggerDestination();
    loggerDestination = newDestination; // Update the logger destination

    // Update the Fastify logger to use the new destination
    fastifyInstance.log = pino(
        {
            level: "info",
        },
        loggerDestination
    );

    fastifyInstance.log.info("Log file rotated for the new day.");
}, 24 * 60 * 60 * 1000); // Check every 24 hours

fastifyInstance.register(require("fastify-cors"), {
    origin: "*",
});

// Some commands require a response that iterates a specific byte
// It appears it can be shared across all devices, but it should still
// be iterated
let iter = 0;
const CLIENT_ITER_REQUEST = Buffer.from([0x83]);
const SERVER_ITER_RESPONSE = () =>
    Buffer.from([0x88, 0x00, 0x00, 0x00, 0x03, 0x00, ++iter % 0xff, 0x00]);

// The client sends along it's MAC address in the initial connection
// We don't care but it likes a response
const CLIENT_INFO_BUFFER = Buffer.from([0x23]);
const SERVER_CLIENT_ACK = Buffer.from([
    0x28, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00,
]);

// There is a specific handshake that needs to occur before the client
// will accept commands
const CLIENT_CONNECTION_REQUEST = Buffer.from([
    0xc3, 0x00, 0x00, 0x00, 0x01, 0x0c,
]);
const SERVER_CONNECTION_RESPONSE = Buffer.from([
    0xc8, 0x00, 0x00, 0x00, 0x0b, 0x0d, 0x07, 0xe7, 0x05, 0x16, 0x02, 0x14,
    0x2a, 0x3a, 0xfe, 0x0c,
]);

// The client will sometimes send diagnostic data - acknowledge it
const CLIENT_DATA = Buffer.from([0x43, 0x00, 0x00, 0x00]);
const SERVER_CLIENT_DATA_ACK = Buffer.from([
    0x48, 0x00, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00,
]);

// Clients get fussy if they don't hear from the server frequently
const CLIENT_HEARTBEAT = Buffer.from([0xd3, 0x00, 0x00, 0x00, 0x00]);
const SERVER_HEARTBEAT = Buffer.from([0xd8, 0x00, 0x00, 0x00, 0x00]);

const CMD_TURN_ON = (id) => {
    //fastifyInstance.log.info(`ID: ${id}`);
    const value = 134 - 63 + id;
    //fastifyInstance.log.info(`Value: ${value}`);

    return Buffer.from([
        0x73,
        0x00,
        0x00,
        0x00,
        0x1f,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x7e,
        0x86,
        0x00,
        0x00,
        0x00,
        0xf8,
        0xd0,
        0x0d,
        0x00,
        0x86,
        0x00,
        0x00,
        0x00,
        0x00,
        id,
        0x00,
        0xd0,
        0x11,
        0x02,
        0x01,
        0x00,
        0x00,
        value,
        0x7e,
    ]);
};

const CMD_TURN_OFF = (id) => {
    //fastifyInstance.log.info(`ID: ${id}`);
    const value = 134 - 64 + id;
    //fastifyInstance.log.info(`Value: ${value}`);

    return Buffer.from([
        0x73,
        0x00,
        0x00,
        0x00,
        0x1f,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x7e,
        0x86,
        0x00,
        0x00,
        0x00,
        0xf8,
        0xd0,
        0x0d,
        0x00,
        0x86,
        0x00,
        0x00,
        0x00,
        0x00,
        id,
        0x00,
        0xd0,
        0x11,
        0x02,
        0x00,
        0x00,
        0x00,
        value,
        0x7e,
    ]);
};

const CMD_SET_BRIGHTNESS = (brightness, id) => {
    const value = 0 + brightness + id;
    return Buffer.from([
        0x73,
        0x00,
        0x00,
        0x00,
        0x22,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x7e,
        0x00,
        0x00,
        0x00,
        0x00,
        0xf8,
        0xf0,
        0x10,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        id,
        0x00,
        0xf0,
        0x11,
        0x2,
        0x1,
        brightness,
        0xff,
        0xff,
        0xff,
        0xff,
        value,
        0x7e,
    ]);
};

const CMD_GET_INFO = Buffer.from([
    0x73, 0x00, 0x00, 0x00, 0x18, 0x4b, 0x05, 0xba, 0xbd, 0x85, 0xd3, 0x00,
    0x7e, 0x0b, 0x00, 0x00, 0x00, 0xf8, 0x52, 0x06, 0x00, 0x00, 0x00, 0xff,
    0xff, 0x00, 0x00, 0x56, 0x7e,
]);

const CMD_SET_COLOR = (red, green, blue, id) => {
    let value = red + green + blue + id;
    while (value > 255) {
        value -= 255;
    }
    fastifyInstance.log.info(`Value: ${value}`);
    return Buffer.from([
        0x73,
        0x00,
        0x00,
        0x00,
        0x22,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x7e,
        0x00,
        0x00,
        0x00,
        0x00,
        0xf8,
        0xf0,
        0x10,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        id,
        0x00,
        0xf0,
        0x11,
        0x2,
        0x1,
        0xff,
        0xfe,
        red,
        green,
        blue,
        value,
        0x7e,
    ]);
};

const CMD_SET_TEMPERATURE = (temperature, id) => {
    let value = 3 + temperature + id;
    while (value > 255) {
        value -= 255;
    }
    fastifyInstance.log.info(`Value: ${value}`);
    return Buffer.from([
        0x73,
        0x00,
        0x00,
        0x00,
        0x22,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x7e,
        0x00,
        0x00,
        0x00,
        0x00,
        0xf8,
        0xf0,
        0x10,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        id,
        0x00,
        0xf0,
        0x11,
        0x2,
        0x1,
        0xff,
        temperature,
        0x00,
        0x00,
        0x00,
        value,
        0x7e,
    ]);
};

const CMD_CUSTOM = (custom) => {
    return Buffer.from([custom]);
};

// Some commands have a "return" code that we can use to make sure
// the state of devices stays in sync
const UPDATE_CLIENT_STATE = Buffer.from([0x83, 0x00, 0x00, 0x00, 0x25]);

const INITIAL_CLIENT_STATE_PREFIX = Buffer.from([0x73, 0x00, 0x00, 0x00]);

function isInitialClientState(data) {
    if (!data.slice(0, 4).equals(INITIAL_CLIENT_STATE_PREFIX)) {
        return false;
    }

    const fifthValue = data.readUInt8(4);

    if (fifthValue !== 13) {
        return true;
    }

    return false;
}

const INVALID_COMMAND = Buffer.from([
    0x7b, 0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

let devices = {};

const server = tls.createServer(options);

server.on("error", function (error) {
    fastifyInstance.log.error(error);
    server.destroy();
});

const sendTCPData = (sock, data) =>
    new Promise((resolve, reject) => {
        try {
            if (
                !sock.write(data, (err) => {
                    if (err) reject(err);
                    resolve();
                })
            ) {
                sock.once("drain", resolve);
            } else {
                process.nextTick(resolve);
            }
        } catch (e) {
            reject(e);
        }
    });

server.on("secureConnection", (socket) => {
    fastifyInstance.log.info(
        `New connection: ${socket.remoteAddress}:${socket.remotePort}`
    );
    devices[socket.remoteAddress] = {
        socket: socket,
        name: {},
        state: {},
    };
    setTimeout(() => {
        sendTCPData(socket, CMD_GET_INFO);
        fastifyInstance.log.info(
            `Server Requesting Info: ${CMD_GET_INFO.toString("hex")}`
        );
    }, 10000); // 10 seconds delay

    // All the back & forth init communication is handled here
    socket.on("data", async (data) => {
        fastifyInstance.log.info(
            `${socket.remoteAddress}:${socket.remotePort} sent: ${data
                .toString("hex")
                .match(/.{2}/g)
                .join(",")}`
        );

        if (data.subarray(0, 1).equals(CLIENT_INFO_BUFFER)) {
            await sendTCPData(socket, SERVER_CLIENT_ACK);
            const idSubstring = data.subarray(12, 28);
            const extractedId = Buffer.from(idSubstring).toString("ascii");

            devices[socket.remoteAddress].name = { name: extractedId };

            fastifyInstance.log.info(`Received ID: ${extractedId}`);
            fastifyInstance.log.info(
                `Server sent: ${SERVER_CLIENT_ACK.toString("ascii")}`
            );
        }
        if (data.equals(CLIENT_CONNECTION_REQUEST)) {
            await sendTCPData(socket, SERVER_CONNECTION_RESPONSE);
            fastifyInstance.log.info(
                `Server sent: ${SERVER_CONNECTION_RESPONSE.toString("ascii")}`
            );
        }
        if (data.subarray(0, 4).equals(CLIENT_DATA)) {
            await sendTCPData(socket, SERVER_CLIENT_DATA_ACK);
            fastifyInstance.log.info(
                `Server sent: ${SERVER_CLIENT_DATA_ACK.toString("ascii")}`
            );
        }
        if (data.equals(CLIENT_HEARTBEAT)) {
            await sendTCPData(socket, SERVER_HEARTBEAT);
            fastifyInstance.log.info(
                `Server sent: ${SERVER_HEARTBEAT.toString("hex")}`
            );
        }
        if (data.subarray(0, 1).equals(CLIENT_ITER_REQUEST)) {
            const buf = SERVER_ITER_RESPONSE();
            await sendTCPData(socket, buf);
            fastifyInstance.log.info(`Server sent: ${buf.toString("ascii")}`);
        }

        if (data.subarray(0, 5).equals(UPDATE_CLIENT_STATE)) {
            const id = data[24];
            const state = Boolean(data[32]);
            const brightness = data[33];
            const temperature = data[34];
            const red = data[35];
            const green = data[36];
            const blue = data[37];

            fastifyInstance.log.info(
                `${socket.remoteAddress}:${socket.remotePort} Updating Info`
            );
            fastifyInstance.log.info(
                `${socket.remoteAddress}:${
                    socket.remotePort
                } ID: ${id}, State: ${
                    state ? "on" : "off"
                }, Brightness: ${brightness},  Temperature: ${temperature}, Color: (${red}, ${green}, ${blue})`
            );
            devices[socket.remoteAddress].state = {
                type: "light",
                id,
                status: state,
                brightness,
                temperature,
                color: {
                    r: red,
                    g: green,
                    b: blue,
                },
            };
        }

        if (isInitialClientState(data)) {
            const id = data[27];
            const state = Boolean(data[35]);
            const brightness = data[39];
            const temperature = data[43];
            const red = data[47];
            const green = data[48];
            const blue = data[49];

            fastifyInstance.log.info(
                `${socket.remoteAddress}:${socket.remotePort} is a smart light`
            );
            fastifyInstance.log.info(
                `${socket.remoteAddress}:${
                    socket.remotePort
                } ID: ${id}, State: ${
                    state ? "on" : "off"
                }, Brightness: ${brightness},  Temperature: ${temperature}, Color: (${red}, ${green}, ${blue})`
            );
            devices[socket.remoteAddress].state = {
                type: "light",
                id,
                status: state,
                brightness,
                temperature,
                color: {
                    r: red,
                    g: green,
                    b: blue,
                },
            };
        }
        if (data.equals(INVALID_COMMAND)) {
            fastifyInstance.log.info(`Client did not accept the last command!`);
            return `Client did not accept the last command!`;
        }
    });

    socket.on("close", () => {
        delete devices[socket.remoteAddress];
        fastifyInstance.log.info(
            `Connection closed: ${socket.remoteAddress}:${socket.remotePort}`
        );
    });

    socket.on("end", function () {
        delete devices[socket.remoteAddress];
        fastifyInstance.log.info(
            `EOT: ${socket.remoteAddress}:${socket.remotePort}`
        );
    });

    socket.on("error", (err) => {
        delete devices[socket.remoteAddress];
        fastifyInstance.log.error(err);
    });

    socket.on("timeout", () => {
        delete devices[socket.remoteAddress];
        fastifyInstance.log.info(
            `Timeout: ${socket.remoteAddress}:${socket.remotePort}`
        );
    });
});

const params = {
    type: "object",
    properties: {
        IP: { type: "string" },
    },
    required: ["IP"],
};

const opts = {
    schema: {
        body: {
            type: "object",
            properties: {
                status: { type: ["string", "number"] },
                info: { type: ["string", "number"] },
                id: { type: ["string", "number"] },
                brightness: {
                    type: ["string", "number"],
                },
                temperature: { type: ["string", "number"] },
                color: {
                    type: "object",
                    properties: {
                        r: { type: ["string", "number"] },
                        g: { type: ["string", "number"] },
                        b: { type: ["string", "number"] },
                    },
                    custom: { type: ["string", "number"] },
                },
            },
        },
        params,
    },
};

fastifyInstance.post("/api/devices/:IP", opts, async (req, res) => {
    try {
        let {
            body: { brightness, temperature, color, status, id, info, custom },
            params: { IP },
        } = req;

        if (!(IP in devices)) throw new Error("Not found");
        const sock = devices[IP].socket;

        switch (status) {
            case "on":
            case 1:
            case "1":
                await sendTCPData(sock, CMD_TURN_ON(Number(id))); // Pass the id as an argument to CMD_TURN_ON
                devices[IP].state.status = true; // Update device state for status
                break;

            case "off":
            case 0:
            case "0":
                await sendTCPData(sock, CMD_TURN_OFF(Number(id))); // Pass the id as an argument to CMD_TURN_OFF
                devices[IP].state.status = false; // Update device state for status
                break;

            default:
                break;
        }

        if (brightness) {
            await sendTCPData(
                sock,
                CMD_SET_BRIGHTNESS(Number(brightness), Number(id))
            );
            devices[IP].state.brightness = Number(brightness); // Update device state for brightness
        }

        if (temperature) {
            await sendTCPData(
                sock,
                CMD_SET_TEMPERATURE(Number(temperature), Number(id))
            );
            devices[IP].state.temperature = Number(temperature); // Update device state for temperature
        }

        if (color) {
            fastifyInstance.log.info(
                `Calling CMD_SET_COLOR with: r=${color.r}, g=${color.g}, b=${color.b}, id=${id}`
            );
            await sendTCPData(
                sock,
                CMD_SET_COLOR(
                    Number(color.r),
                    Number(color.g),
                    Number(color.b),
                    Number(id)
                )
            );
            devices[IP].state.color = {
                r: Number(color.r),
                g: Number(color.g),
                b: Number(color.b),
            }; // Update device state for color
        }

        if (info) {
            await sendTCPData(sock, CMD_GET_INFO);
        }

        if (custom) {
            await sendTCPData(sock, CMD_CUSTOM(custom));
        }

        return {
            id,
            status,
            brightness,
            temperature,
            color,
            info,
            custom,
        };
    } catch (e) {
        fastifyInstance.log.error(e);
        res.statusCode = 400;
        return { error: e.message || "Unknown error" };
    }
});

fastifyInstance.get("/api/devices", async (req, res) => {
    try {
        return Object.keys(devices);
    } catch (e) {
        res.statusCode = 400;
        return e;
    }
});

fastifyInstance.get(
    "/api/devices/:IP",
    { schema: { params } },
    async (req, res) => {
        try {
            const {
                params: { IP },
            } = req;
            if (!(IP in devices)) throw new Error("Not found");

            return {
                ...devices[IP].state,
                ...devices[IP].name,
            };
        } catch (e) {
            res.statusCode = 404;
            return e;
        }
    }
);

// Start the server
fastifyInstance.listen(API_PORT, API_HOST, (err) => {
    if (err) {
        fastifyInstance.log.error(err);
        process.exit(1);
    }
    server.listen(TLS_PORT, TLS_HOST, function () {
        fastifyInstance.log.info(
            `TLS server listening on ${TLS_HOST}:${TLS_PORT}`
        );
    });
});
