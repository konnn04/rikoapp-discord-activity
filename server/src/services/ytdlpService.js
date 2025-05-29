import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { pipeline } from 'stream/promises';
import { createWriteStream, existsSync } from 'fs';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url); 
const __dirname = path.dirname(__filename);

// Get default root directory
const rootDir = path.join(__dirname, '..', '..', '..', '..');

/**
 * YT-DLP Manager class for handling YouTube audio downloads and streams
 */
export class YTDLPManager {
    constructor(options = {}) {
        // Get custom bin directory or use default
        const defaultBinDir = path.join(rootDir, 'bin');
        
        this.options = {
            autoUpdate: true,
            updateInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
            cookies: null,
            binDir: defaultBinDir,
            ...options
        };
        
        // Set instance paths based on bin directory
        this.binDir = this.options.binDir;
        this.ytdlpPath = path.join(this.binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
        this.cookiesPath = path.join(this.binDir, 'cookies.txt');
        this.updateCheckFile = path.join(this.binDir, 'last_update_check.txt');
        
        this.initialized = false;
    }

    /**
     * Ensure yt-dlp is initialized before use
     * @returns {Promise<YTDLPManager>} This instance, initialized
     */
    async ensureInitialized() {
        try {
            if (!this.initialized) {
                console.log('YTDLPManager not initialized, initializing...');
                await this.initialize();
                
                // Double-check initialization status
                if (!this.initialized) {
                    console.warn('YTDLPManager initialize() completed but initialized flag is still false. Forcing initialization state.');
                    this.initialized = true;
                }
            }
            
            // Verify the binary exists even if we think we're initialized
            if (!existsSync(this.ytdlpPath)) {
                console.warn(`yt-dlp binary missing at ${this.ytdlpPath} despite initialization. Re-downloading...`);
                await this.downloadYTDLP();
                
                // Make binary executable on Unix platforms
                if (process.platform !== 'win32') {
                    await fs.chmod(this.ytdlpPath, 0o755);
                }
            }
            
            return this;
        } catch (error) {
            console.error('Error ensuring yt-dlp initialization:', error);
            // Still mark as initialized to prevent endless retry loops
            this.initialized = true;
            throw error;
        }
    }

    /**
     * Initialize yt-dlp - ensure binary exists and is up-to-date
     * @returns {Promise<YTDLPManager>} This instance after initialization
     */
    async initialize() {
        if (this.initialized) return this;

        try {
            // Ensure bin directory exists
            await fs.mkdir(this.binDir, { recursive: true });

            // Check if yt-dlp exists, if not download it
            if (!existsSync(this.ytdlpPath)) {
                console.log(`yt-dlp binary not found at ${this.ytdlpPath}. Downloading...`);
                await this.downloadYTDLP();
            }

            // Make binary executable on Unix platforms
            if (process.platform !== 'win32') {
                await fs.chmod(this.ytdlpPath, 0o755);
            }

            // Check if an update is needed
            if (this.options.autoUpdate) {
                await this.checkForUpdates();
            }

            // Set up cookies if provided
            if (this.options.cookies) {
                await this.setCookies(this.options.cookies);
            }

            this.initialized = true;
            console.log(`yt-dlp initialized successfully at ${this.ytdlpPath}`);
            return this;
        } catch (error) {
            console.error('Error initializing yt-dlp:', error);
            throw error;
        }
    }

    /**
     * Download the yt-dlp binary for the current platform
     */
    async downloadYTDLP() {
        const platform = process.platform;
        let url;
    
        if (platform === 'win32') {
            url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
        } else if (platform === 'darwin') {
            url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
        } else {
            // Default to Linux
            url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
        }
    
        try {
            console.log(`Downloading yt-dlp from ${url} to ${this.ytdlpPath}...`);
            
            // Function to follow redirects with improved error handling
            const downloadWithRedirects = async (url, redirectCount = 0) => {
                if (redirectCount > 5) {
                    throw new Error('Too many redirects');
                }
                
                return new Promise((resolve, reject) => {
                    const request = https.get(url, {
                        timeout: 30000, // 30 second timeout
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    }, response => {
                        // Handle redirects
                        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                            console.log(`Redirected to: ${response.headers.location}`);
                            downloadWithRedirects(response.headers.location, redirectCount + 1)
                                .then(resolve)
                                .catch(reject);
                            return;
                        }
                        
                        if (response.statusCode !== 200) {
                            reject(new Error(`Failed to download yt-dlp: HTTP status ${response.statusCode}`));
                            return;
                        }
                        
                        const file = createWriteStream(this.ytdlpPath);
                        pipeline(response, file)
                            .then(() => resolve())
                            .catch(err => {
                                fs.unlink(this.ytdlpPath).catch(() => {});
                                reject(err);
                            });
                    }).on('error', err => {
                        reject(err);
                    });
                });
            };
            
            await downloadWithRedirects(url);
            console.log(`yt-dlp successfully downloaded to ${this.ytdlpPath}`);
        } catch (error) {
            console.error('Error downloading yt-dlp:', error);
            throw error;
        }
    }

    /**
     * Check for updates to yt-dlp
     */
    async checkForUpdates() {
        try {
            // Check if we've checked recently using more efficient approach
            let shouldCheck = true;
            try {
                const stats = await fs.stat(this.updateCheckFile);
                const lastCheck = stats.mtime;
                if ((Date.now() - lastCheck.getTime()) < this.options.updateInterval) {
                    shouldCheck = false;
                }
            } catch (err) {
                // File doesn't exist or can't be read, proceed with check
            }

            if (shouldCheck) {
                console.log('Checking for yt-dlp updates...');
                const { stdout } = await execAsync(`"${this.ytdlpPath}" -U`);

                // Update the check timestamp
                await fs.writeFile(this.updateCheckFile, new Date().toISOString());

                console.log('yt-dlp update check result:', stdout);
            }
        } catch (error) {
            console.error('Error checking for yt-dlp updates:', error);
            // Don't throw here, just log the error
        }
    }

    /**
     * Set YouTube cookies for authentication
     * @param {String} cookiesContent - Content of the cookies.txt file
     */
    async setCookies(cookiesContent) {
        try {
            await fs.writeFile(this.cookiesPath, cookiesContent);
            console.log('YouTube cookies set successfully');
        } catch (error) {
            console.error('Error setting cookies:', error);
            throw error;
        }
    }

    /**
     * Get direct audio URL for a YouTube video
     * @param {String} videoId - YouTube video ID
     * @param {Object} options - Options for extraction
     * @returns {Promise<String>} - Direct audio URL
     */
    async getDirectAudioUrl(videoId, options = {}) {
        await this.ensureInitialized();

        // Validate videoId
        if (!videoId || typeof videoId !== 'string') {
            console.error('Invalid videoId provided:', videoId);
            throw new Error('Invalid YouTube video ID');
        }

        // Clean up videoId to ensure it's just the ID
        // YouTube IDs are typically 11 characters
        let cleanVideoId = videoId;
        if (videoId.includes('youtube.com') || videoId.includes('youtu.be')) {
            // Extract ID from URL
            const match = videoId.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
            if (match && match[1]) {
                cleanVideoId = match[1];
            } else {
                throw new Error('Could not extract valid YouTube ID from URL');
            }
        }

        console.log(`Fetching audio URL for video ID: ${cleanVideoId}`);
        const url = `https://www.youtube.com/watch?v=${cleanVideoId}`;
        const args = [
            // Just get URL, don't download
            '--get-url',
            // Audio only
            '-f', 'bestaudio[ext=m4a]/bestaudio/best',
            // Don't show warnings
            '--no-warnings',
            // Quiet mode
            '--quiet',
            // Optimize for network conditions
            '--force-ipv4',
            '--geo-bypass',
            // Add timeout to prevent hanging
            '--socket-timeout', '15',
            '--retries', '2',
            '--concurrent-fragments', '1'
        ];

        // Add cookies if they exist
        if (existsSync(this.cookiesPath)) {
            args.push('--cookies', this.cookiesPath);
        }

        // Add custom options
        if (options.additionalArgs) {
            args.push(...options.additionalArgs);
        }

        // Add URL at the end
        args.push(url);

        try {
            console.log(`Extracting direct URL for video: ${videoId}`);
            
            // Create a promise that will reject after timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('yt-dlp execution timeout')), 15000);
            });
            
            // Create the execution promise
            const execPromise = new Promise(async (resolve, reject) => {
                try {
                    const { stdout, stderr } = await execAsync(`"${this.ytdlpPath}" ${args.join(' ')}`);
                    
                    if (stderr) {
                        console.error(`yt-dlp stderr: ${stderr}`);
                    }
                    
                    const directUrl = stdout.trim();
                    if (!directUrl) {
                        reject(new Error('Failed to extract direct URL'));
                    } else {
                        resolve(directUrl);
                    }
                } catch (error) {
                    reject(error);
                }
            });
            
            // Race between execution and timeout
            const directUrl = await Promise.race([execPromise, timeoutPromise]);
            
            console.log(`Successfully extracted audio URL for ${videoId}`);
            return directUrl;
        } catch (error) {
            console.error('Error extracting direct URL:', error);
            
            // Try using youtubeijsService as fallback
            try {
                console.log('Attempting fallback to youtubei.js for URL extraction');
                const { getYouTubeAPI } = await import('./youtubeijsService.js');
                const youtubeAPI = await getYouTubeAPI();
                const streamUrl = await youtubeAPI.getStreamURL(cleanVideoId, 'audio');
                
                if (streamUrl) {
                    console.log('Successfully retrieved URL via youtubei.js fallback');
                    return streamUrl;
                }
            } catch (fallbackError) {
                console.error('Fallback URL extraction also failed:', fallbackError);
            }
            
            throw error;
        }
    }

    /**
     * Stream audio for a YouTube video
     * @param {String} videoId - YouTube video ID
     * @param {Object} options - Options for streaming
     * @returns {Promise<ReadableStream>} - Audio stream
     */
    async streamAudio(videoId, options = {}) {
        await this.ensureInitialized();

        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const defaultOptions = [
            // Output to stdout
            '-o', '-',
            // Audio only
            '-f', 'bestaudio[ext=m4a]/bestaudio/best',
            // Extract audio
            '-x',
            // Don't download the entire video before starting
            '--no-part',
            // Don't show download progress
            '--quiet',
            '--no-warnings',
            // Limit fragment retries
            '--fragment-retries', '3',
            // No metadata, no thumbnails
            '--no-write-info-json',
            '--no-write-annotations',
            '--no-write-thumbnail',
            // Network optimization options
            '--force-ipv4',
            '--no-check-certificate', 
            '--prefer-insecure',
            '--geo-bypass',
            // Smaller buffer for faster streaming start
            '--buffer-size', '16K',
            // Disable unnecessary features
            '--no-playlist',
            '--no-simulate',
            '--no-progress',
            // Network connection optimization
            '--concurrent-fragments', '1',
            // Add timeout to prevent hanging
            '--socket-timeout', '10',
            '--retries', '1'
        ];

        // Add cookies if they exist
        if (existsSync(this.cookiesPath)) {
            defaultOptions.push('--cookies', this.cookiesPath);
        }

        // Custom user options
        if (options.additionalArgs) {
            defaultOptions.push(...options.additionalArgs);
        }

        // Add the URL at the end
        defaultOptions.push(url);

        console.log(`Starting yt-dlp stream for video: ${videoId}`);

        return new Promise((resolve, reject) => {
            const ytDlp = spawn(this.ytdlpPath, defaultOptions, {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
                // Add higher priority on Windows
                ...((process.platform === 'win32') ? { priority: 'high' } : {})
            });

            let stderrData = '';
            let streamResolved = false;
            let streamTimeout = null;

            // Set a timeout to kill the process if it takes too long
            streamTimeout = setTimeout(() => {
                if (!streamResolved) {
                    console.error(`yt-dlp process timed out for video: ${videoId}`);
                    ytDlp.kill();
                    reject(new Error('Stream extraction timed out'));
                }
            }, 15000); // 15 seconds timeout

            // Handle errors on streams
            ytDlp.stderr.on('data', (data) => {
                stderrData += data.toString();
                console.error(`yt-dlp stderr: ${data}`);
            });

            ytDlp.on('error', (error) => {
                if (streamTimeout) clearTimeout(streamTimeout);
                console.error(`yt-dlp process error: ${error}`);
                
                if (!streamResolved) {
                    streamResolved = true;
                    reject(error);
                }
            });

            ytDlp.on('close', (code) => {
                if (streamTimeout) clearTimeout(streamTimeout);
                
                if (code !== 0 && code !== null && !streamResolved) {
                    const error = new Error(`yt-dlp process exited with code ${code}: ${stderrData}`);
                    console.error(error.message);
                    streamResolved = true;
                    reject(error);
                }
            });

            // Once we get data on stdout, we can resolve with the stream
            ytDlp.stdout.once('data', () => {
                console.log(`Stream started for video: ${videoId}`);
                if (streamTimeout) clearTimeout(streamTimeout);
                
                if (!streamResolved) {
                    streamResolved = true;
                    resolve(ytDlp.stdout);
                }
            });

            // Return the stdout stream for audio
            if (!streamResolved) {
                streamResolved = true;
                resolve(ytDlp.stdout);
            }
        });
    }

    /**
     * Get available audio formats for a video
     * @param {String} videoId - YouTube video ID
     * @returns {Promise<Array>} - List of available formats
     */
    async getAudioFormats(videoId) {
        await this.ensureInitialized();

        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const { stdout } = await execAsync(`"${this.ytdlpPath}" -F --no-warnings ${url}`);

        // Parse the output to extract format information - improved parsing logic
        return stdout.split('\n')
            .filter(line => line.includes('audio only'))
            .map(line => {
                const match = line.match(/^(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.*?)(?:\s+@\s+(.*))?$/);
                if (match) {
                    return {
                        id: match[1],
                        ext: match[2],
                        resolution: match[3],
                        bitrate: match[4],
                        description: match[5].trim(),
                        filesize: match[6] || 'unknown'
                    };
                }
                return null;
            })
            .filter(Boolean); // More concise than format !== null
    }
}

// Singleton instance
let instance = null;

/**
 * Get the YT-DLP Manager singleton instance
 * @param {Object} options - Optional configuration for YT-DLP Manager
 * @returns {Promise<YTDLPManager>} Initialized YT-DLP Manager
 */
export async function getYTDLPManager(options = {}) {
  try {
    if (!instance) {
      console.log('Creating new YTDLPManager instance');
      instance = new YTDLPManager(options);
      await instance.initialize();
    } else if (!instance.initialized) {
      console.log('Using existing YTDLPManager instance but ensuring initialization');
      await instance.ensureInitialized();
    }
    return instance;
  } catch (error) {
    console.error('Error getting YTDLPManager:', error);
    // If instance failed to initialize, try to create a fresh one
    if (instance && !instance.initialized) {
      console.log('Previous instance failed to initialize, creating a new one');
      instance = new YTDLPManager(options);
      await instance.initialize();
    }
    return instance;
  }
}

export default new YTDLPManager();