/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

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
    private host: string;
    private port: number;
    private password: string;
    private isConnectedState: boolean = false;
    private repeatMode: RepeatMode = "off"; // Track locally since API only has on/off
    private fetchFn: FetchFunction;

    constructor(
        fetchFn: FetchFunction,
        host: string = "localhost",
        port: number = 4800,
        password: string = ""
    ) {
        this.fetchFn = fetchFn;
        this.host = host;
        this.port = port;
        this.password = password;
    }

    // Build complete URL with parameters for httpQ API
    private buildUrl(endpoint: string, params: Record<string, any>): string {
        // Use the configured host and port for the httpQ API
        const baseUrl = `http://${this.host}:${this.port}/${endpoint}`;
        const urlParams = new URLSearchParams();

        // Always add password if provided
        if (this.password) {
            urlParams.append("p", this.password);
        }

        // Add endpoint-specific parameters
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                urlParams.append(key, String(value));
            }
        }

        return `${baseUrl}?${urlParams.toString()}`;
    }

    // Generic endpoint caller with full type safety
    async call<T extends EndpointName>(
        endpoint: T,
        params: EndpointParams<T>
    ): Promise<EndpointResponse<T>> {
        try {
            const url = this.buildUrl(endpoint, params);
            console.log(`[WinampClient] Calling endpoint: ${endpoint} with params:`, params);
            const { status, data } = await this.fetchFn(url);
            console.log(`[WinampClient] Raw response - status: ${status}, data: "${data}"`);

            if (status !== 200) {
                this.isConnectedState = false;
                throw new Error(`HTTP ${status}: ${data}`);
            }

            this.isConnectedState = true;
            const parsedResponse = this.parseResponse(data.trim());
            console.log("[WinampClient] Parsed response:", parsedResponse);
            return parsedResponse as EndpointResponse<T>;
        } catch (error) {
            this.isConnectedState = false;
            console.error(`[WinampClient] Call failed for ${endpoint}:`, error);
            throw new Error(`Winamp API call failed (${endpoint}): ${error instanceof Error ? error.message : "Unknown error"}`);
        }
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

            return {
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
        } catch (error) {
            this.isConnectedState = false;
            throw new Error(`Failed to get player state: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
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
        return (await this.call("play", {})) === 1;
    }

    async pause(): Promise<boolean> {
        return (await this.call("pause", {})) === 1;
    }

    async stop(): Promise<boolean> {
        return (await this.call("stop", {})) === 1;
    }

    async next(): Promise<boolean> {
        return (await this.call("next", {})) === 1;
    }

    async prev(): Promise<boolean> {
        return (await this.call("prev", {})) === 1;
    }

    async setVolume(level: number): Promise<boolean> {
        return (await this.call("setvolume", { level: Math.max(0, Math.min(255, level)) })) === 1;
    }

    // Enhanced repeat control with UI-friendly modes
    async setRepeat(mode: RepeatMode): Promise<boolean> {
        const wasEnabled = await this.call("repeat_status", {});

        switch (mode) {
            case "off":
                if (wasEnabled) {
                    await this.call("repeat", { enable: 0 });
                }
                break;
            case "track":
            case "playlist":
                if (!wasEnabled) {
                    await this.call("repeat", { enable: 1 });
                }
                break;
        }

        this.repeatMode = mode;
        return true;
    }

    async toggleRepeat(): Promise<RepeatMode> {
        const nextMode: RepeatMode = this.repeatMode === "off" ? "playlist" :
            this.repeatMode === "playlist" ? "track" : "off";
        await this.setRepeat(nextMode);
        return nextMode;
    }

    async setShuffle(enabled: boolean): Promise<boolean> {
        return (await this.call("shuffle", { enable: enabled ? 1 : 0 })) === 1;
    }

    async toggleShuffle(): Promise<boolean> {
        const currentStatus = await this.call("shuffle_status", {});
        const newStatus = currentStatus === 1 ? 0 : 1;
        await this.call("shuffle", { enable: newStatus });
        return newStatus === 1;
    }

    async seekTo(milliseconds: number): Promise<boolean> {
        return (await this.call("jumptotime", { ms: Math.max(0, milliseconds) })) === 1;
    }

    async setPlaylistPosition(index: number): Promise<boolean> {
        return (await this.call("setplaylistpos", { index })) === 1;
    }

    // Helper methods
    private parseResponse(text: string): string | number | BooleanResponse | PlaybackStatus {
        if (text === "") return "";

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

    // Configuration update
    public configure(host: string, port: number, password: string = "") {
        this.host = host;
        this.port = port;
        this.password = password;
        this.isConnectedState = false; // Reset connection state
    }

    // Get current connection state
    public getConnectionState(): boolean {
        return this.isConnectedState;
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
