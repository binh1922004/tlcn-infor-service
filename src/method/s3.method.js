import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {config} from "../../config/env.js";

const bucketName = config.bucket_name;
const bucketRegion = config.bucket_region;
const accessKey = config.aws_access_key;
const secretKey = config.aws_secret_key;

const s3 = new S3Client({
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
    },
    region: bucketRegion
})

export const uploadFile = async (key, body, contentType) => {
    const params = {
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
    }
    console.log(params)

    const command = new PutObjectCommand(params);
    return await s3.send(command);
}
