/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { debugError, debugLog } from "./debugLog";
import { HTTPQ_VOLUME_MAX } from "./types/endpoints";
import type { EndpointName, EndpointParams, EndpointResponse, RepeatMode, VolumeLevel } from "./types/endpoints";

export type { RepeatMode };

// httpQ joins list responses with a caller-supplied delimiter and does no
// escaping, so the delimiter must be something a track title cannot contain.
// ";" was in use and silently corrupted any playlist with a semicolon in it.
const LIST_DELIM = "\n";
const FIELD_DELIM = "\x1f"; // ASCII unit separator

// httpQ volume is 0-255; everything above this class works in percent.
const toPercent = (raw: number) => Math.round((raw / HTTPQ_VOLUME_MAX) * 100);
const fromPercent = (pct: number) =>
    Math.round((Math.max(0, Math.min(100, pct)) / 100) * HTTPQ_VOLUME_MAX);

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

// Utility types for type-safe endpoint calls

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
    albumArt?: string; // URL to album art image
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

// Generic API abstraction class
class WinampAPI {
    private config: HTTPQConfig;
    private base: string;

    constructor(config: HTTPQConfig) {
        this.config = config;
        this.base = `${config.host}:${config.port}`;
    }

    // Type-safe generic call method
    async call<T extends EndpointName>(endpoint: T, params: EndpointParams<T>): Promise<{ status: number; data: EndpointResponse<T>; }> {
        const nativeHelper = VencordNative.pluginHelpers.WinampControls;
        if (!nativeHelper || typeof nativeHelper[endpoint] !== "function") {
            throw new Error(`Unknown endpoint: ${endpoint}`);
        }
        // Always pass base, password, then params in order
        // The native layer is responsible for param order/handling
        const paramValues = Object.values(params);
        const result = await nativeHelper[endpoint](this.base, this.config.password, ...paramValues);
        return { status: result.status, data: result.data };
    }
}

// Main client class
export class WinampClient {
    private config: HTTPQConfig;
    private api: WinampAPI;
    private isConnectedState: boolean = false;
    private repeatMode: RepeatMode = "off"; // Track locally since API only has on/off
    private consecutiveFailures: number = 0;
    private readonly maxConsecutiveFailures: number = 5;

    constructor(config: HTTPQConfig) {
        this.config = { ...config };
        this.api = new WinampAPI(this.config);
    }

    // Type-safe API call with error handling
    private async call<T extends EndpointName>(endpoint: T, params: EndpointParams<T>): Promise<{ status: number; data: EndpointResponse<T>; }> {
        try {
            const result = await this.api.call(endpoint, params);
            if (result.status !== 200) {
                this.handleCallFailure(endpoint, `HTTP ${result.status}: ${result.data}`);
                throw new Error(`HTTP ${result.status}: ${result.data}`);
            }
            this.consecutiveFailures = 0;
            this.isConnectedState = true;
            if (!this.isPollingCall(endpoint)) {
                debugLog("WinampClient", `${endpoint}: ${this.formatLogData(String(result.data).trim())}`);
            }
            return result;
        } catch (error) {
            this.handleCallFailure(endpoint, error);
            throw error;
        }
    }

    private handleCallFailure(endpoint: EndpointName, error: any) {
        this.isConnectedState = false;
        this.consecutiveFailures++;

        // Only log the first few failures to avoid flooding the console
        // After that, just throw silently when threshold is reached
        if (this.consecutiveFailures <= this.maxConsecutiveFailures) {
            debugError("WinampClient", `${endpoint} failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}):`, error);
        }

        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            throw new ConsecutiveFailuresError(this.consecutiveFailures);
        }
    }

    private isPollingCall(endpoint: EndpointName): boolean {
        // These run on every 1s poll; logging them would flood the console.
        const pollingEndpoints: EndpointName[] = [
            "isPlaying", "getOutputTime", "getVolume", "getListPos", "getListLength",
            "repeatStatus", "shuffleStatus", "getCurrentTitle", "getPlaylistFile",
            "hasId3Tag", "getId3Tag", "hasId3v2Tag", "getId3v2Tag"
        ];
        return pollingEndpoints.includes(endpoint);
    }

    private formatLogData(data: string): string {
        if (data.length > 50) {
            return `${data.substring(0, 50)}...`;
        }
        return data;
    }

    // --- Type-safe wrappers ---
    async getPlayerState(): Promise<PlayerState> {
        try {
            const [status, position, length, volume, playlistPos, playlistLen, repeat, shuffle, title, file] = await Promise.all([
                this.call("isPlaying", {}),
                this.getCurrentPosition(),
                this.getTrackLength(),
                this.call("getVolume", {}),
                this.call("getListPos", {}),
                this.call("getListLength", {}),
                this.call("repeatStatus", {}),
                this.call("shuffleStatus", {}),
                this.call("getCurrentTitle", {}),
                this.call("getPlaylistFile", {})
            ]);
            const statusNum = Number(status.data);
            const positionMs = position;
            const lengthMs = length;
            const volumeNum = toPercent(Number(volume.data));
            const playlistPosNum = Number(playlistPos.data);
            const playlistLenNum = Number(playlistLen.data);
            const repeatNum = Number(repeat.data);
            const shuffleNum = Number(shuffle.data);
            const titleStr = String(title.data);
            const fileStr = String(file.data);
            this.repeatMode = repeatNum === 1 ? this.repeatMode : "off";
            const track = await this.buildTrackInfo(titleStr, fileStr, playlistPosNum, lengthMs);
            const state: PlayerState = {
                track,
                isPlaying: statusNum === 1,
                isPaused: statusNum === 3,
                isStopped: statusNum === 0,
                position: positionMs,
                volume: volumeNum,
                playlist: {
                    position: playlistPosNum,
                    length: playlistLenNum
                },
                repeat: this.repeatMode,
                shuffle: shuffleNum === 1,
                isConnected: this.isConnectedState
            };
            if (track) {
                debugLog("WinampClient", `Poll: "${track.name}" by ${track.artist} | ${this.formatTime(positionMs)}/${this.formatTime(lengthMs)} | Vol: ${volumeNum}% | ${statusNum === 1 ? "Playing" : statusNum === 3 ? "Paused" : "Stopped"}`);
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

    async getCurrentPosition(): Promise<number> {
        const result = await this.call("getOutputTime", { frmt: 0 });
        return Number(result.data);
    }

    async getTrackLength(): Promise<number> {
        const result = await this.call("getOutputTime", { frmt: 1 });
        return Number(result.data) * 1000;
    }

    private async buildTrackInfo(title: string, file: string, playlistIndex: number, duration: number): Promise<Track | null> {
        if (!title && !file) return null;
        try {
            const metadata = await this.getTrackMetadata(playlistIndex);
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

    private parseTrackTitle(title: string): { title?: string; artist?: string; } {
        if (!title) return {};
        // getcurrenttitle comes from the player's window caption, which is
        // prefixed with the playlist position ("4. Artist - Track"). Without
        // stripping it the artist ends up as "4. Artist".
        title = title.replace(/^\s*\d+\.\s+/, "");
        const parts = title.split(" - ");
        if (parts.length >= 2) {
            return {
                artist: parts[0].trim(),
                title: parts.slice(1).join(" - ").trim()
            };
        }
        return { title: title.trim() };
    }

    // Tries ID3v2 before ID3v1: the original only ever asked for v1, so every
    // modern MP3 (v2-only) reported no metadata at all. Files with neither —
    // FLAC, Ogg and friends, which carry Vorbis comments httpQ cannot read —
    // still fall back to parsing the player's formatted title.
    async getTrackMetadata(index?: number): Promise<TrackMetadata> {
        const attempts = [
            { has: "hasId3v2Tag", get: "getId3v2Tag" },
            { has: "hasId3Tag", get: "getId3Tag" },
        ] as const;

        for (const { has, get } of attempts) {
            try {
                const hasTagResult = await this.call(has, { index });
                if (!Number(hasTagResult.data)) continue;

                const tagsResult = await this.call(get, {
                    tags: "t,a,l,y,g,r",
                    delim: FIELD_DELIM,
                    index
                });
                if (!tagsResult.data) continue;

                const [title, artist, album, year, genre, track] =
                    String(tagsResult.data).split(FIELD_DELIM);
                const metadata: TrackMetadata = {
                    title: title || undefined,
                    artist: artist || undefined,
                    album: album || undefined,
                    year: year || undefined,
                    genre: genre || undefined,
                    track: track || undefined
                };
                // A tag can exist but be entirely blank; fall through if so.
                if (Object.values(metadata).some(Boolean)) return metadata;
            } catch {
                // Try the next tag version.
            }
        }
        return {};
    }

    // Two bulk requests rather than one per track: this used to issue N+2
    // sequential round-trips, so a 200-track playlist meant 202 of them.
    async getPlaylist(): Promise<Track[]> {
        try {
            const [titlesResult, filesResult] = await Promise.all([
                this.call("getPlaylistTitleList", { delim: LIST_DELIM }),
                this.call("getPlaylistFileList", { delim: LIST_DELIM }),
            ]);
            if (!titlesResult.data) return [];

            const titles = String(titlesResult.data).split(LIST_DELIM);
            const files = String(filesResult.data ?? "").split(LIST_DELIM);

            // Titles come from the player and always exist; files may not if
            // the playlist changed between the two calls.
            return titles.map((title, i) => {
                const parsed = this.parseTrackTitle(title);
                return {
                    id: `${i}-${files[i] ?? ""}`,
                    name: parsed.title || title || "Unknown Track",
                    duration: 0,
                    artist: parsed.artist || "Unknown Artist",
                    filePath: files[i] ?? "",
                    playlistIndex: i,
                };
            });
        } catch (error) {
            throw new Error(`Failed to get playlist: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    // --- Playback control helpers ---
    async play(): Promise<boolean> {
        const result = await this.call("play", {});
        return String(result.data).trim() === "1";
    }
    async pause(): Promise<boolean> {
        const result = await this.call("pause", {});
        return String(result.data).trim() === "1";
    }
    async stop(): Promise<boolean> {
        const result = await this.call("stop", {});
        return String(result.data).trim() === "1";
    }
    async next(): Promise<boolean> {
        const result = await this.call("next", {});
        return String(result.data).trim() === "1";
    }
    async prev(): Promise<boolean> {
        const result = await this.call("prev", {});
        return String(result.data).trim() === "1";
    }
    // level is a percentage; httpQ wants 0-255.
    async setVolume(level: number): Promise<boolean> {
        const result = await this.call("setVolume", { level: fromPercent(level) });
        return String(result.data).trim() === "1";
    }
    async setRepeat(mode: RepeatMode): Promise<boolean> {
        this.repeatMode = mode;
        if (mode === "off") {
            const result = await this.call("repeat", { enable: 0 });
            return String(result.data).trim() === "1";
        } else {
            const result = await this.call("repeat", { enable: 1 });
            return String(result.data).trim() === "1";
        }
    }
    async toggleRepeat(): Promise<RepeatMode> {
        const nextMode: RepeatMode = this.repeatMode === "off" ? "playlist" :
            this.repeatMode === "playlist" ? "track" : "off";
        await this.setRepeat(nextMode);
        return nextMode;
    }
    async setShuffle(enabled: boolean): Promise<boolean> {
        const result = await this.call("shuffle", { enable: enabled ? 1 : 0 });
        return String(result.data).trim() === "1";
    }
    async toggleShuffle(): Promise<boolean> {
        const currentStatusResult = await this.call("shuffleStatus", {});
        const currentStatus = Number(currentStatusResult.data);
        const newStatus = currentStatus === 1 ? 0 : 1;
        await this.call("shuffle", { enable: newStatus });
        return newStatus === 1;
    }
    async seekTo(ms: number): Promise<boolean> {
        const result = await this.call("jumpToTime", { ms });
        return String(result.data).trim() === "1";
    }
    async setPlaylistPosition(index: number): Promise<boolean> {
        const result = await this.call("setPlaylistPos", { index });
        return String(result.data).trim() === "1";
    }
    async isConnected(): Promise<boolean> {
        try {
            const result = await this.call("getVersion", {});
            if (String(result.data).trim() === "0") {
                throw new Error("Winamp httpQ plugin not available or responding with invalid version");
            }
            return true;
        } catch {
            return false;
        }
    }
    static async testConfig(config: HTTPQConfig): Promise<boolean> {
        try {
            const client = new WinampClient(config);
            const result = await client.call("getVersion", {});
            if (String(result.data).trim() === "0") {
                throw new Error("Winamp httpQ plugin not available or responding with invalid version");
            }
            return true;
        } catch (error) {
            debugError("WinampClient", "Configuration test failed:", error);
            return false;
        }
    }
    public configure(config: HTTPQConfig) {
        this.config = { ...config };
        this.api = new WinampAPI(this.config);
        this.isConnectedState = false;
    }
    public getConfig(): HTTPQConfig {
        return { ...this.config };
    }
    public getConnectionState(): boolean {
        return this.isConnectedState;
    }
    public resetFailureCount(silent = false) {
        this.consecutiveFailures = 0;
        if (!silent) {
            debugLog("WinampClient", "Consecutive failure count reset");
        }
    }
    public getConsecutiveFailures(): number {
        return this.consecutiveFailures;
    }
}
