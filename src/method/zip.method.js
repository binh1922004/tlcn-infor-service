import yauzl from 'yauzl';
import path from 'path';
import { uploadFile, getContentType } from './s3.method.js';

export class CustomZipProcessor {
    async processZipFromBuffer(zipBuffer, originalFileName, s3Prefix = '', problemId) {
        try {
            // 1. Validate ZIP structure first
            const validation = await this.validateZipStructure(zipBuffer);
            if (!validation.isValid) {
                throw new Error(`ZIP validation failed: ${validation.errors.join(', ')}`);
            }

            console.log(`✅ ZIP validation passed. Found ${validation.folderCount} folders with valid .in/.out files`);

            // 2. Upload original ZIP to S3
            const zipS3Key = s3Prefix ? `${s3Prefix}/${originalFileName}` : originalFileName;
            await uploadFile(zipS3Key, zipBuffer, 'application/zip');

            // 3. Extract and restructure files
            const processedFiles = await this.extractAndRestructure(zipBuffer, s3Prefix, problemId);

            return {
                originalZip: {
                    s3Key: zipS3Key,
                    fileName: originalFileName
                },
                summary: {
                    totalFolders: validation.folderCount,
                    totalFiles: processedFiles.length,
                    structure: 'id/in/id_X.in and id/out/id_X.out'
                }
            };

        } catch (error) {
            console.error('❌ Error processing ZIP:', error);
            throw error;
        }
    }
    // Helper function to check if file is macOS metadata
    isMacOSMetadata(fileName) {
        // Check for __MACOSX folder
        if (fileName.startsWith('__MACOSX/')) {
            return true;
        }

        // Check for ._ resource fork files
        if (fileName.includes('/._') || fileName.startsWith('._')) {
            return true;
        }

        // Check for .DS_Store files
        if (fileName.includes('.DS_Store')) {
            return true;
        }

        return false;
    }
    async validateZipStructure(zipBuffer) {
        return new Promise((resolve) => {
            const validation = {
                isValid: true,
                errors: [],
                folderCount: 0,
                filesByFolder: new Map(),
                skippedFiles: [] // Track skipped macOS files
            };

            yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    validation.isValid = false;
                    validation.errors.push(`Cannot read ZIP file: ${err.message}`);
                    return resolve(validation);
                }

                zipfile.readEntry();

                zipfile.on('entry', (entry) => {
                    const fileName = entry.fileName;

                    // Skip directories
                    if (/\/$/.test(fileName)) {
                        zipfile.readEntry();
                        return;
                    }
                    // Skip macOS metadata files
                    if (this.isMacOSMetadata(fileName)) {
                        validation.skippedFiles.push(fileName);
                        console.log(`⏭️  Skipping macOS metadata: ${fileName}`);
                        zipfile.readEntry();
                        return;
                    }

                    // Parse file path
                    const pathParts = fileName.split('/');
                    if (pathParts.length < 2) {
                        validation.isValid = false;
                        validation.errors.push(`File ${fileName} is not in a folder structure`);
                        zipfile.readEntry();
                        return;
                    }

                    const folderName = pathParts[0];
                    const actualFileName = pathParts[pathParts.length - 1];
                    const fileExtension = path.extname(actualFileName).toLowerCase();
                    console.log(`<UNK> ZIP file ${fileName} is ${fileExtension}`);
                    // Validate file extension - CHỈ CHẤP NHẬN .in và .out
                    if (fileExtension !== '.inp' && fileExtension !== '.out') {
                        validation.isValid = false;
                        validation.errors.push(`❌ REJECTED: Invalid file type "${fileName}". Only .inp and .out files are allowed - result ${fileExtension}`);
                        zipfile.readEntry();
                        return;
                    }

                    // Track files by folder
                    if (!validation.filesByFolder.has(folderName)) {
                        validation.filesByFolder.set(folderName, { in: false, out: false });
                    }

                    const folderFiles = validation.filesByFolder.get(folderName);
                    if (fileExtension === '.inp') {
                        folderFiles.in = true;
                    } else if (fileExtension === '.out') {
                        folderFiles.out = true;
                    }

                    zipfile.readEntry();
                });

                zipfile.on('end', () => {
                    // Validate that each folder has both .inp and .out files
                    for (const [folderName, files] of validation.filesByFolder) {
                        if (!files.in || !files.out) {
                            validation.isValid = false;
                            validation.errors.push(`Folder ${folderName} is missing ${!files.in ? '.inp' : '.out'} file`);
                        }
                    }

                    validation.folderCount = validation.filesByFolder.size;

                    if (validation.isValid && validation.folderCount === 0) {
                        validation.isValid = false;
                        validation.errors.push('No valid folder structure found');
                    }

                    resolve(validation);
                });

                zipfile.on('error', (error) => {
                    validation.isValid = false;
                    validation.errors.push(`ZIP reading error: ${error.message}`);
                    resolve(validation);
                });
            });
        });
    }

    async extractAndRestructure(zipBuffer, s3Prefix = '', id) {
        return new Promise((resolve, reject) => {
            const uploadPromises = [];
            const folderMap = new Map(); // Map original folder names to sequential IDs
            let folderCounter = 1;

            yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
                if (err) return reject(err);

                zipfile.readEntry();

                zipfile.on('entry', (entry) => {
                    const fileName = entry.fileName;

                    // Skip directories
                    if (/\/$/.test(fileName)) {
                        zipfile.readEntry();
                        return;
                    }
                    // Skip macOS metadata files
                    if (this.isMacOSMetadata(fileName)) {
                        zipfile.readEntry();
                        return;
                    }

                    zipfile.openReadStream(entry, (err, readStream) => {
                        if (err) {
                            console.error(`Error reading ${fileName}:`, err);
                            zipfile.readEntry();
                            return;
                        }

                        const chunks = [];
                        readStream.on('data', chunk => chunks.push(chunk));
                        readStream.on('end', () => {
                            const fileBuffer = Buffer.concat(chunks);

                            // Parse original file structure
                            const pathParts = fileName.split('/');
                            const originalFolderName = pathParts[0];
                            const originalFileName = pathParts[pathParts.length - 1];
                            const fileExtension = path.extname(originalFileName).toLowerCase();

                            // Assign sequential ID to folder if not already assigned
                            if (!folderMap.has(originalFolderName)) {
                                folderMap.set(originalFolderName, folderCounter);
                                folderCounter++;
                            }

                            const folderId = folderMap.get(originalFolderName);

                            // Create new file structure: id/in/id_X.in or id/out/id_X.out
                            const fileType = fileExtension.substring(1); // Remove the dot
                            const newFileName = `${id}_${folderId}${fileExtension}`;
                            const newPath = `${fileType}/${newFileName}`;

                            const s3Key = s3Prefix ? `${s3Prefix}/${newPath}` : newPath;

                            // Upload to S3 using your existing uploadFile function
                            const uploadPromise = uploadFile(
                                s3Key,
                                fileBuffer,
                                getContentType(fileExtension)
                            ).then(result => ({
                                originalPath: fileName,
                                newPath: newPath,
                                s3Key: s3Key,
                                size: fileBuffer.length,
                                folderId: folderId,
                                fileType: fileType,
                                uploadResult: result
                            }));

                            uploadPromises.push(uploadPromise);
                            zipfile.readEntry();
                        });

                        readStream.on('error', (error) => {
                            console.error(`Error reading stream for ${fileName}:`, error);
                            zipfile.readEntry();
                        });
                    });
                });

                zipfile.on('end', async () => {
                    try {
                        const results = await Promise.all(uploadPromises);
                        console.log(`✅ Restructured and uploaded ${results.length} files to S3`);
                        console.log(`📁 Processed ${folderMap.size} folders with sequential IDs`);

                        resolve(results);
                    } catch (error) {
                        reject(error);
                    }
                });

                zipfile.on('error', reject);
            });
        });
    }
}