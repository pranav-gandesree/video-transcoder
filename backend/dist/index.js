"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const client = new client_sqs_1.SQSClient({
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
    }
});
const ecsClient = new client_ecs_1.ECSClient({
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
    }
});
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const command = new client_sqs_1.ReceiveMessageCommand({
            QueueUrl: process.env.AWS_QUEUE_URL || "",
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20
        });
        while (true) {
            const { Messages } = yield client.send(command);
            if (!Messages) {
                console.log("No messages");
                continue;
            }
            try {
                for (const message of Messages) {
                    const { Body, MessageId } = message;
                    console.log("Message Received ", { Body, MessageId });
                    if (!Body)
                        continue;
                    //validate  and parse the message
                    const event = JSON.parse(Body);
                    //ignore the test event
                    if ("Service" in event && "Event" in event) {
                        if (event.Event === "s3:TestEvent") {
                            yield client.send(new client_sqs_1.DeleteMessageCommand({
                                QueueUrl: process.env.AWS_QUEUE_URL,
                                ReceiptHandle: message.ReceiptHandle
                            }));
                        }
                        ;
                        continue;
                    }
                    for (const record of event.Records) {
                        const { s3 } = record;
                        const { bucket, object: { key }, } = s3;
                        //spin the docker container    
                        const runTaskCommand = new client_ecs_1.RunTaskCommand({
                            taskDefinition: process.env.AWS_TASK_DEFINITION,
                            cluster: process.env.AWS_CLUSTER,
                            launchType: "FARGATE",
                            networkConfiguration: {
                                awsvpcConfiguration: {
                                    assignPublicIp: "ENABLED",
                                    securityGroups: ["sg-08b6d4c234278dde5"],
                                    subnets: [
                                        "subnet-0f9e02fc95e4d7074",
                                        "subnet-0117776924798391b",
                                        "subnet-0041298f73de604e8"
                                    ],
                                }
                            },
                            overrides: {
                                containerOverrides: [{
                                        name: "video-transcoder",
                                        environment: [
                                            { name: "BUCKET_NAME", value: bucket.name },
                                            { name: "KEY", value: key }
                                        ]
                                    }]
                            }
                        });
                        yield ecsClient.send(runTaskCommand);
                        //delete the message from queue
                        yield client.send(new client_sqs_1.DeleteMessageCommand({
                            QueueUrl: process.env.AWS_QUEUE_URL,
                            ReceiptHandle: message.ReceiptHandle
                        }));
                    }
                }
            }
            catch (error) {
                console.log("Error processing message", error);
            }
        }
    });
}
main();
