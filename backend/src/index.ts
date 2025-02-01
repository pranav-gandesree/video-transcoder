import { SQSClient, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
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
                if(event.Event === "s3:TestEvent") continue;
            }

           
            for (const record of event.Records){
                const {s3} = record;
                const {
                    bucket,
                    object: {key},
                } = s3;

                 //spin the docker container

            }

            //delete the message from queue

        }
        
       } catch (error) {
        console.log("Error processing message", error)
       }
    }
}

main();