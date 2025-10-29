import {PutObjectCommand, S3Client, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command} from "@aws-sdk/client-s3";
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
    console.log('Uploading:', params)

    const command = new PutObjectCommand(params);
    return await s3.send(command);
}

export const getFile = async (key) => {
    const params = {
        Bucket: bucketName,
        Key: key,
    }

    const command = new GetObjectCommand(params);
    const response = await s3.send(command);

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
        chunks.push(chunk);
    }

    return {
        buffer: Buffer.concat(chunks),
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified
    };
}

export const deleteFile = async (key) => {
    const params = {
        Bucket: bucketName,
        Key: key,
    }

    const command = new DeleteObjectCommand(params);
    return await s3.send(command);
}

export const listFiles = async (prefix = '', maxKeys = 1000) => {
    const params = {
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
    }

    const command = new ListObjectsV2Command(params);
    const response = await s3.send(command);

    return {
        files: response.Contents || [],
        hasMore: response.IsTruncated,
        continuationToken: response.NextContinuationToken
    };
}

export const getContentType = (fileName) => {
    const ext = fileName.toLowerCase().split('.').pop();
    const contentTypes = {
        'zip': 'application/zip',
        'inp': 'text/plain',
        'out': 'text/plain',
        'txt': 'text/plain',
        'json': 'application/json',
        'js': 'application/javascript',
        'html': 'text/html',
        'css': 'text/css',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'pdf': 'application/pdf'
    };
    return contentTypes[ext] || 'application/octet-stream';
}