/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// HTTPQConfig interface for connection configuration
export interface HTTPQConfig {
    host: string;
    port: number;
    password?: string;
}

// Custom error for consecutive fetch failures
export class ConsecutiveFailuresError extends Error {
    public readonly failureCount: number;

    constructor(failureCount: number) {
        super(`HttpQ connection failed ${failureCount} consecutive times`);
        this.name = "ConsecutiveFailuresError";
        this.failureCount = failureCount;
    }
}

// Core response types
export type PlaybackStatus = 0 | 1 | 3; // 0 = stopped, 1 = playing, 3 = paused
export type BooleanResponse = 0 | 1;
export type VolumeLevel = number; // 0-255
export type EQBand = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type TimeFormat = 0 | 1; // 0 = milliseconds, 1 = seconds
export type RepeatMode = "off" | "track" | "playlist";


// Simplified endpoint definitions
export interface WinampEndpoints {
    // System
    getversion: { params: {}, response: string; };
    restart: { params: {}, response: BooleanResponse; };
    internet: { params: {}, response: BooleanResponse; };

    // Playback control
    play: { params: {}, response: BooleanResponse; };
    pause: { params: {}, response: BooleanResponse; };
    stop: { params: {}, response: BooleanResponse; };
    next: { params: {}, response: BooleanResponse; };
    prev: { params: {}, response: BooleanResponse; };

    // Playback info
    isplaying: { params: {}, response: PlaybackStatus; };
    getoutputtime: { params: { frmt: TimeFormat; }, response: number; };
    jumptotime: { params: { ms: number; }, response: BooleanResponse; };
    getcurrenttitle: { params: {}, response: string; };

    // Volume
    getvolume: { params: {}, response: VolumeLevel; };
    setvolume: { params: { level: number; }, response: BooleanResponse; };
    volumeup: { params: {}, response: BooleanResponse; };
    volumedown: { params: {}, response: BooleanResponse; };

    // Playlist
    getlistlength: { params: {}, response: number; };
    getlistpos: { params: {}, response: number; };
    setplaylistpos: { params: { index: number; }, response: BooleanResponse; };
    getplaylistfile: { params: { index?: number; }, response: string; };
    getplaylisttitle: { params: { index?: number; }, response: string; };
    getplaylisttitlelist: { params: { delim: string; }, response: string; };

    // Modes
    repeat: { params: { enable: BooleanResponse; }, response: BooleanResponse; };
    repeat_status: { params: {}, response: BooleanResponse; };
    shuffle: { params: { enable: BooleanResponse; }, response: BooleanResponse; };
    shuffle_status: { params: {}, response: BooleanResponse; };

    // Metadata
    getid3tag: { params: { tags: string, delim: string, index?: number; }, response: string; };
    hasid3tag: { params: { index?: number; }, response: BooleanResponse; };

    // EQ
    geteqdata: { params: { band: EQBand; }, response: number; };
    seteqdata: { params: { band: EQBand, level: number; }, response: BooleanResponse; };
}

// Utility types for type-safe endpoint calls
export type EndpointName = keyof WinampEndpoints;
export type EndpointParams<T extends EndpointName> = WinampEndpoints[T]["params"];
export type EndpointResponse<T extends EndpointName> = WinampEndpoints[T]["response"];

// Platform-agnostic fetch function type
export type FetchFunction = (url: string) => Promise<{ status: number; data: string; }>;

// UI-friendly track interface - complete with all available information
export interface Track {
    id: string;
    name: string;
    duration: number; // milliseconds
    artist: string;
    album?: string;
    year?: string;
    genre?: string;
    track?: string;
    filePath: string;
    playlistIndex: number;
}

// UI-friendly player state - consolidated and ready to use
export interface PlayerState {
    // Current track with all metadata
    track: Track | null;

    // Playback state
    isPlaying: boolean;
    isPaused: boolean;
    isStopped: boolean;
    position: number; // milliseconds

    // Audio settings
    volume: VolumeLevel;

    // Playlist info
    playlist: {
        position: number;
        length: number;
    };

    // Playback modes
    repeat: RepeatMode;
    shuffle: boolean;

    // Connection status
    isConnected: boolean;
}

// Raw metadata from ID3 tags
export interface TrackMetadata {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    genre?: string;
    track?: string;
}

// Main client class
export class WinampClient {
    private config: HTTPQConfig;
    private isConnectedState: boolean = false;
    private repeatMode: RepeatMode = "off"; // Track locally since API only has on/off
    private fetchFn: FetchFunction;
    private consecutiveFailures: number = 0;
    private readonly maxConsecutiveFailures: number = 5;

    constructor(fetchFn: FetchFunction, config: HTTPQConfig) {
        this.fetchFn = fetchFn;
        this.config = { ...config };
    }

    // Build complete URL with parameters for httpQ API
    private buildUrl(endpoint: string, params: Record<string, any>): string {
        // Use the configured host and port for the httpQ API
        const baseUrl = `http://${this.config.host}:${this.config.port}/${endpoint}`;
        const urlParams = new URLSearchParams();

        // Always add password if provided
        if (this.config.password) {
            urlParams.append("p", this.config.password);
        }

        // Add endpoint-specific parameters
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                urlParams.append(key, String(value));
            }
        }

        return `${baseUrl}?${urlParams.toString()}`;
    }

    private async call<T extends keyof WinampEndpoints>(
        endpoint: T,
        params: WinampEndpoints[T]["params"]
    ): Promise<WinampEndpoints[T]["response"]> {
        const url = this.buildUrl(endpoint, params);

        try {
            const { status, data } = await this.fetchFn(url);

            if (status !== 200) {
                this.handleCallFailure(endpoint, `HTTP ${status}: ${data}`);
                throw new Error(`HTTP ${status}: ${data}`);
            }

            // Reset consecutive failures on successful call
            this.consecutiveFailures = 0;
            this.isConnectedState = true;
            const trimmedData = data.trim();

            // Only log individual calls for non-polling operations or errors
            if (!this.isPollingCall(endpoint)) {
                console.log(`[WinampClient] ${url}: ${this.formatLogData(trimmedData)}`);
            }

            return this.parseResponse(endpoint, trimmedData);
        } catch (error) {
            this.handleCallFailure(endpoint, error);
            throw error;
        }
    }

    private handleCallFailure(endpoint: string, error: any) {
        this.isConnectedState = false;
        this.consecutiveFailures++;

        console.error(`[WinampClient] ${endpoint} failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}):`, error);

        // Throw dedicated error when threshold is reached
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            throw new ConsecutiveFailuresError(this.consecutiveFailures);
        }
    }

    private isPollingCall(endpoint: string): boolean {
        const pollingEndpoints = [
            "isplaying", "getoutputtime", "getvolume", "getlistpos", "getlistlength",
            "repeat_status", "shuffle_status", "getcurrenttitle", "getplaylistfile", "hasid3tag"
        ];
        return pollingEndpoints.includes(endpoint);
    }

    private formatLogData(data: string): string {
        // Truncate very long paths/strings for readability
        if (data.length > 50) {
            return `${data.substring(0, 50)}...`;
        }
        return data;
    }

    // Get complete player state - consolidated for UI use
    async getPlayerState(): Promise<PlayerState> {
        try {
            const [status, position, length, volume, playlistPos, playlistLen, repeat, shuffle, title, file] = await Promise.all([
                this.call("isplaying", {}),
                this.getCurrentPosition(),
                this.getTrackLength(),
                this.call("getvolume", {}),
                this.call("getlistpos", {}),
                this.call("getlistlength", {}),
                this.call("repeat_status", {}),
                this.call("shuffle_status", {}),
                this.call("getcurrenttitle", {}),
                this.call("getplaylistfile", {})
            ]);

            // Update internal repeat state based on API
            this.repeatMode = repeat === 1 ? this.repeatMode : "off";

            // Get track metadata if available
            const track = await this.buildTrackInfo(title, file, playlistPos, length);

            const state: PlayerState = {
                track,
                isPlaying: status === 1,
                isPaused: status === 3,
                isStopped: status === 0,
                position: position,
                volume: volume,
                playlist: {
                    position: playlistPos,
                    length: playlistLen
                },
                repeat: this.repeatMode,
                shuffle: shuffle === 1,
                isConnected: this.isConnectedState
            };

            // Log a single consolidated polling update
            if (track) {
                console.log(`[WinampClient] Poll: "${track.name}" by ${track.artist} | ${this.formatTime(position)}/${this.formatTime(length)} | Vol: ${Math.round((volume / 255) * 100)}% | ${status === 1 ? "Playing" : status === 3 ? "Paused" : "Stopped"}`);
            }

            return state;
        } catch (error) {
            this.isConnectedState = false;
            throw new Error(`Failed to get player state: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    private formatTime(ms: number): string {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    // Get current playback position in milliseconds
    async getCurrentPosition(): Promise<number> {
        return await this.call("getoutputtime", { frmt: 0 });
    }

    // Get current track length in milliseconds
    async getTrackLength(): Promise<number> {
        const lengthInSeconds = await this.call("getoutputtime", { frmt: 1 });
        return lengthInSeconds * 1000; // Convert to milliseconds
    }

    // Build complete track info with metadata
    private async buildTrackInfo(title: string, file: string, playlistIndex: number, duration: number): Promise<Track | null> {
        if (!title && !file) return null;

        try {
            // Get metadata if available
            const metadata = await this.getTrackMetadata(playlistIndex);

            // Parse artist and title from the title string if metadata is not available
            const parsedInfo = this.parseTrackTitle(title);

            return {
                id: `${playlistIndex}-${file}`,
                name: metadata.title || parsedInfo.title || title || "Unknown Track",
                duration: duration,
                artist: metadata.artist || parsedInfo.artist || "Unknown Artist",
                album: metadata.album,
                year: metadata.year,
                genre: metadata.genre,
                track: metadata.track,
                filePath: file,
                playlistIndex: playlistIndex
            };
        } catch (error) {
            // Fallback to basic info if metadata fails
            const parsedInfo = this.parseTrackTitle(title);
            return {
                id: `${playlistIndex}-${file}`,
                name: parsedInfo.title || title || "Unknown Track",
                duration: duration,
                artist: parsedInfo.artist || "Unknown Artist",
                filePath: file,
                playlistIndex: playlistIndex
            };
        }
    }

    // Parse track title string (often "Artist - Title")
    private parseTrackTitle(title: string): { title?: string; artist?: string; } {
        if (!title) return {};

        const parts = title.split(" - ");
        if (parts.length >= 2) {
            return {
                artist: parts[0].trim(),
                title: parts.slice(1).join(" - ").trim()
            };
        }

        return { title: title.trim() };
    }

    // Get track metadata from ID3 tags
    async getTrackMetadata(index?: number): Promise<TrackMetadata> {
        try {
            const hasTag = await this.call("hasid3tag", { index });
            if (!hasTag) return {};

            const tags = await this.call("getid3tag", {
                tags: "t,a,l,y,g,r",
                delim: ";",
                index
            });

            if (!tags) return {};

            const [title, artist, album, year, genre, track] = tags.split(";");
            return {
                title: title || undefined,
                artist: artist || undefined,
                album: album || undefined,
                year: year || undefined,
                genre: genre || undefined,
                track: track || undefined
            };
        } catch (error) {
            return {};
        }
    }

    // Get complete playlist with track info
    async getPlaylist(): Promise<Track[]> {
        try {
            const length = await this.call("getlistlength", {});
            const titles = await this.call("getplaylisttitlelist", { delim: ";" });

            if (!titles) return [];

            const titleArray = titles.split(";");
            const playlist: Track[] = [];

            for (let i = 0; i < Math.min(length, titleArray.length); i++) {
                const file = await this.call("getplaylistfile", { index: i });
                const track = await this.buildTrackInfo(titleArray[i], file, i, 0); // Duration unknown for playlist items
                if (track) {
                    playlist.push(track);
                }
            }

            return playlist;
        } catch (error) {
            throw new Error(`Failed to get playlist: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    // Playback control helpers
    async play(): Promise<boolean> {
        console.log("[WinampClient] Play");
        return (await this.call("play", {})) === 1;
    }

    async pause(): Promise<boolean> {
        console.log("[WinampClient] Pause");
        return (await this.call("pause", {})) === 1;
    }

    async stop(): Promise<boolean> {
        console.log("[WinampClient] Stop");
        return (await this.call("stop", {})) === 1;
    }

    async next(): Promise<boolean> {
        console.log("[WinampClient] Next track");
        return (await this.call("next", {})) === 1;
    }

    async prev(): Promise<boolean> {
        console.log("[WinampClient] Previous track");
        return (await this.call("prev", {})) === 1;
    }

    async setVolume(level: number): Promise<boolean> {
        const clampedLevel = Math.max(0, Math.min(255, level));
        console.log(`[WinampClient] Volume: ${Math.round((clampedLevel / 255) * 100)}%`);
        return (await this.call("setvolume", { level: clampedLevel })) === 1;
    }

    // Enhanced repeat control with UI-friendly modes
    async setRepeat(mode: RepeatMode): Promise<boolean> {
        console.log(`[WinampClient] Repeat: ${mode.toUpperCase()}`);
        this.repeatMode = mode;

        if (mode === "off") {
            return (await this.call("repeat", { enable: 0 })) === 1;
        } else {
            // Enable repeat first, then set the mode
            const result = (await this.call("repeat", { enable: 1 })) === 1;
            // Note: httpQ API doesn't distinguish between track/playlist repeat, we track it locally
            return result;
        }
    }

    async toggleRepeat(): Promise<RepeatMode> {
        const nextMode: RepeatMode = this.repeatMode === "off" ? "playlist" :
            this.repeatMode === "playlist" ? "track" : "off";
        await this.setRepeat(nextMode);
        return nextMode;
    }

    async setShuffle(enabled: boolean): Promise<boolean> {
        console.log(`[WinampClient] Shuffle: ${enabled ? "ON" : "OFF"}`);
        return (await this.call("shuffle", { enable: enabled ? 1 : 0 })) === 1;
    }

    async toggleShuffle(): Promise<boolean> {
        const currentStatus = await this.call("shuffle_status", {});
        const newStatus = currentStatus === 1 ? 0 : 1;
        await this.call("shuffle", { enable: newStatus });
        return newStatus === 1;
    }

    async seekTo(ms: number): Promise<boolean> {
        console.log(`[WinampClient] Seeking to ${this.formatTime(ms)}`);
        return (await this.call("jumptotime", { ms })) === 1;
    }

    async setPlaylistPosition(index: number): Promise<boolean> {
        return (await this.call("setplaylistpos", { index })) === 1;
    }

    // Helper methods
    private parseResponse(endpoint: string, text: string): string | number | BooleanResponse | PlaybackStatus {
        if (text === "") return "";

        // Special handling for getversion endpoint - "0" means invalid/not available
        if (endpoint === "getversion" && text === "0") {
            throw new Error("Winamp httpQ plugin not available or responding with invalid version");
        }

        const numericValue = Number(text);
        if (!isNaN(numericValue)) {
            return numericValue;
        }

        return text;
    }

    // Connection testing
    async isConnected(): Promise<boolean> {
        try {
            await this.call("getversion", {});
            return true;
        } catch {
            return false;
        }
    }

    // Static method to test configuration
    static async testConfig(fetchFn: FetchFunction, config: HTTPQConfig): Promise<boolean> {
        try {
            const client = new WinampClient(fetchFn, config);
            await client.call("getversion", {});
            return true;
        } catch (error) {
            console.error("[WinampClient] Configuration test failed:", error);
            return false;
        }
    }

    // Configuration update
    public configure(config: HTTPQConfig) {
        this.config = { ...config };
        this.isConnectedState = false; // Reset connection state
    }

    // Get current configuration
    public getConfig(): HTTPQConfig {
        return { ...this.config };
    }

    // Get current connection state
    public getConnectionState(): boolean {
        return this.isConnectedState;
    }

    // Reset consecutive failure count (useful for manual reconnection attempts)
    public resetFailureCount() {
        this.consecutiveFailures = 0;
        console.log("[WinampClient] Consecutive failure count reset");
    }

    // Get current consecutive failure count
    public getConsecutiveFailures(): number {
        return this.consecutiveFailures;
    }
}
export const browserFetch: FetchFunction = async (url: string) => {
    try {
        const response = await fetch(url);
        const data = await response.text();
        return {
            status: response.status,
            data: data
        };
    } catch (error) {
        console.error(`[WinampClient] Browser fetch failed: ${error}`);
        return {
            status: -1,
            data: String(error)
        };
    }
};

export const vencordFetch: FetchFunction = async (url: string) => {
    try {
        return await VencordNative.pluginHelpers.WinampControls.httpQRequest(url);
    } catch (error) {
        console.error(`[WinampControls] Native fetch failed: ${error}`);
        return {
            status: -1,
            data: String(error)
        };
    }
};
