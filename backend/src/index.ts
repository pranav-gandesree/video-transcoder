import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import { S3Event } from "aws-lambda";
import dotenv from "dotenv";

dotenv.config();

const client = new SQSClient({
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
    }
})

const ecsClient = new ECSClient({
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
    }
})

async function main() {
    const command = new ReceiveMessageCommand({
        QueueUrl: process.env.AWS_QUEUE_URL || "",
        MaxNumberOfMessages: 1,
        WaitTimeSeconds:20
    })

    while (true){
        const {Messages} = await client.send(command);
        if(!Messages){
            console.log("No messages")
            continue;
        }

       try {

        for(const message of Messages){
            const {Body, MessageId} = message;
            console.log("Message Received ", {Body, MessageId})

            if(!Body) continue

            //validate  and parse the message
            const event = JSON.parse(Body) as S3Event;

            //ignore the test event
            if("Service" in event && "Event" in event){
                if(event.Event === "s3:TestEvent") {
                    await client.send(
                        new DeleteMessageCommand({
                            QueueUrl: process.env.AWS_QUEUE_URL,
                            ReceiptHandle: message.ReceiptHandle
                        })
                    )
                };
                continue;
            }

           
            for (const record of event.Records){
                const {s3} = record;
                const {
                    bucket,
                    object: {key},
                } = s3;

                 //spin the docker container    
                 const runTaskCommand = new RunTaskCommand({
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
                                {name: "KEY", value: key}
                             ]
                            }]
                    }
                 });
                    await ecsClient.send(runTaskCommand);

                    //delete the message from queue
                    await client.send(
                        new DeleteMessageCommand({
                            QueueUrl: process.env.AWS_QUEUE_URL,
                            ReceiptHandle: message.ReceiptHandle
                        })
                    )

            }

        }
        
       } catch (error) {
        console.log("Error processing message", error)
       }
    }
}

main();