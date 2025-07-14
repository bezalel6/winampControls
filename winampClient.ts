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

// Player state interface
export interface PlayerState {
    playback: {
        status: PlaybackStatus;
        position: number; // milliseconds
        length: number; // milliseconds
        title: string;
        file: string;
    };
    audio: {
        volume: VolumeLevel;
    };
    playlist: {
        position: number;
        length: number;
    };
    modes: {
        repeat: boolean;
        shuffle: boolean;
    };
}

// Track metadata
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
    private baseUrl: string;
    private password: string;

    constructor(baseUrl: string = "http://localhost:4800", password: string = "") {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.password = password;
    }

    // Generic endpoint caller with full type safety
    async call<T extends EndpointName>(
        endpoint: T,
        params: EndpointParams<T>
    ): Promise<EndpointResponse<T>> {
        const urlParams = new URLSearchParams({
            p: this.password,
            ...this.stringifyParams(params)
        });

        const url = `${this.baseUrl}/${endpoint}?${urlParams}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const text = await response.text().then(t => t.trim());
            return this.parseResponse(text) as EndpointResponse<T>;
        } catch (error) {
            throw new Error(`Winamp API call failed (${endpoint}): ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    // Convenient high-level methods
    async getPlayerState(): Promise<PlayerState> {
        try {
            const [status, position, length, volume, playlistPos, playlistLen, repeat, shuffle, title, file] = await Promise.all([
                this.call("isplaying", {}),
                this.call("getoutputtime", { frmt: 0 }),
                this.call("getoutputtime", { frmt: 1 }),
                this.call("getvolume", {}),
                this.call("getlistpos", {}),
                this.call("getlistlength", {}),
                this.call("repeat_status", {}),
                this.call("shuffle_status", {}),
                this.call("getcurrenttitle", {}),
                this.call("getplaylistfile", {})
            ]);

            return {
                playback: {
                    status,
                    position: position,
                    length: length * 1000, // Convert seconds to milliseconds
                    title,
                    file
                },
                audio: {
                    volume
                },
                playlist: {
                    position: playlistPos,
                    length: playlistLen
                },
                modes: {
                    repeat: repeat === 1,
                    shuffle: shuffle === 1
                }
            };
        } catch (error) {
            throw new Error(`Failed to get player state: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    async getPlaylist(): Promise<Array<{ index: number; title: string; file: string; }>> {
        try {
            const length = await this.call("getlistlength", {});
            const titles = await this.call("getplaylisttitlelist", { delim: ";" });

            if (!titles) return [];

            const titleArray = titles.split(";");
            const playlist: Array<{ index: number; title: string; file: string; }> = [];

            for (let i = 0; i < Math.min(length, titleArray.length); i++) {
                const file = await this.call("getplaylistfile", { index: i });
                playlist.push({
                    index: i,
                    title: titleArray[i] || `Track ${i + 1}`,
                    file
                });
            }

            return playlist;
        } catch (error) {
            throw new Error(`Failed to get playlist: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

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
            throw new Error(`Failed to get track metadata: ${error instanceof Error ? error.message : "Unknown error"}`);
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

    async toggleRepeat(): Promise<boolean> {
        const currentStatus = await this.call("repeat_status", {});
        return (await this.call("repeat", { enable: currentStatus === 1 ? 0 : 1 })) === 1;
    }

    async toggleShuffle(): Promise<boolean> {
        const currentStatus = await this.call("shuffle_status", {});
        return (await this.call("shuffle", { enable: currentStatus === 1 ? 0 : 1 })) === 1;
    }

    async seekTo(milliseconds: number): Promise<boolean> {
        return (await this.call("jumptotime", { ms: Math.max(0, milliseconds) })) === 1;
    }

    async setPlaylistPosition(index: number): Promise<boolean> {
        return (await this.call("setplaylistpos", { index })) === 1;
    }

    // Helper methods
    private stringifyParams(params: Record<string, any>): Record<string, string> {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                result[key] = String(value);
            }
        }
        return result;
    }

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
}

// Default client instance
export const winampClient = new WinampClient();
