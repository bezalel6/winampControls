/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { proxyLazyWebpack } from "@webpack";
import { Flux, FluxDispatcher } from "@webpack/common";

export interface Track {
    id: string;
    name: string;
    duration: number;
    artist: string;
    album?: string;
    filePath?: string;
}

interface PlayerState {
    track: Track | null;
    volume: number;
    isPlaying: boolean;
    repeat: Repeat;
    shuffle: boolean;
    position: number;
}

interface HttpQConfig {
    host: string;
    port: number;
    password?: string;
}

type Repeat = "off" | "track" | "playlist";

// Don't wanna run before Flux and Dispatcher are ready!
export const WinampStore = proxyLazyWebpack(() => {
    // For some reason ts hates extends Flux.Store
    const { Store } = Flux;

    class WinampStore extends Store {
        public mPosition = 0;
        public _start = 0;

        public track: Track | null = null;
        public isPlaying = false;
        public repeat: Repeat = "off";
        public shuffle = false;
        public volume = 0;

        public isSettingPosition = false;

        private config: HttpQConfig = {
            host: "127.0.0.1",
            port: 4800,
            password: "pass"
        };

        private pollingInterval: number | null = null;

        // Need to keep track of this manually
        public get position(): number {
            let pos = this.mPosition;
            if (this.isPlaying) {
                pos += Date.now() - this._start;
            }
            return pos;
        }

        public set position(p: number) {
            this.mPosition = p;
            this._start = Date.now();
        }

        private getHttpQUrl(command: string, arg?: string): string {
            const baseUrl = `http://${this.config.host}:${this.config.port}/${command}`;
            const params = new URLSearchParams();

            if (this.config.password) {
                params.append("p", this.config.password);
            }

            if (arg) {
                params.append("a", arg);
            }

            return `${baseUrl}?${params.toString()}`;
        }

        private async httpQRequest(command: string, arg?: string): Promise<string> {
            const url = this.getHttpQUrl(command, arg);

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return await response.text();
            } catch (error) {
                console.error(`[WinampControls] httpQ request failed: ${error}`);
                throw error;
            }
        }

        prev() {
            this.httpQRequest("prev").catch(e =>
                console.error("[WinampControls] Failed to go to previous track:", e)
            );
        }

        next() {
            this.httpQRequest("next").catch(e =>
                console.error("[WinampControls] Failed to go to next track:", e)
            );
        }

        setVolume(percent: number) {
            this.httpQRequest("setvolume", percent.toString()).then(() => {
                this.volume = percent;
                this.emitChange();
            }).catch(e =>
                console.error("[WinampControls] Failed to set volume:", e)
            );
        }

        setPlaying(playing: boolean) {
            const command = playing ? "play" : "pause";
            this.httpQRequest(command).then(() => {
                this.isPlaying = playing;
                this.emitChange();
            }).catch(e =>
                console.error(`[WinampControls] Failed to ${command}:`, e)
            );
        }

        setRepeat(state: Repeat) {
            // HttpQ doesn't have direct repeat control, so we'll track it locally
            this.repeat = state;
            this.emitChange();
            console.log(`[WinampControls] Repeat mode set to ${state} (tracked locally)`);
        }

        setShuffle(state: boolean) {
            this.httpQRequest("shuffle", state ? "1" : "0").then(() => {
                this.shuffle = state;
                this.emitChange();
            }).catch(e => {
                console.error("[WinampControls] Failed to set shuffle:", e);
                // Fallback to local tracking
                this.shuffle = state;
                this.emitChange();
            });
        }

        seek(ms: number) {
            if (this.isSettingPosition) return Promise.resolve();

            this.isSettingPosition = true;

            // Convert milliseconds to seconds for httpQ
            const seconds = Math.floor(ms / 1000);

            return this.httpQRequest("setpos", seconds.toString()).then(() => {
                this.position = ms;
                this.isSettingPosition = false;
            }).catch((e: any) => {
                console.error("[WinampControls] Failed to seek:", e);
                this.isSettingPosition = false;
            });
        }

        // Get current player state from httpQ
        public async getCurrentState(): Promise<PlayerState | null> {
            try {
                const responses = await Promise.all([
                    this.httpQRequest("getplaystatus"),
                    this.httpQRequest("getcurrenttitle"),
                    this.httpQRequest("getvolume"),
                    this.httpQRequest("getpos"),
                    this.httpQRequest("getlength")
                ]);

                const [playStatus, title, volume, position, length] = responses;

                // Parse the responses (httpQ returns simple text)
                const isPlaying = playStatus.trim() === "1";
                const currentVolume = parseInt(volume.trim()) || 0;
                const currentPosition = (parseInt(position.trim()) || 0) * 1000; // Convert to ms
                const trackLength = (parseInt(length.trim()) || 0) * 1000; // Convert to ms

                // Parse track info from title (format may vary)
                const trackInfo = this.parseTrackInfo(title.trim());

                const track: Track = {
                    id: trackInfo.id,
                    name: trackInfo.name,
                    duration: trackLength,
                    artist: trackInfo.artist,
                    album: trackInfo.album,
                    filePath: trackInfo.filePath
                };

                return {
                    track,
                    volume: currentVolume,
                    isPlaying,
                    repeat: this.repeat, // Tracked locally
                    shuffle: this.shuffle, // Tracked locally
                    position: currentPosition
                };
            } catch (error) {
                console.error("[WinampControls] Failed to get current state:", error);
                return null;
            }
        }

        private parseTrackInfo(title: string): { id: string; name: string; artist: string; album?: string; filePath?: string; } {
            // Basic parsing - httpQ usually returns "Artist - Title" or just "Title"
            const parts = title.split(" - ");

            if (parts.length >= 2) {
                const artist = parts[0].trim();
                const name = parts.slice(1).join(" - ").trim();

                return {
                    id: `${artist}-${name}`,
                    name,
                    artist,
                    filePath: title
                };
            }

            return {
                id: title,
                name: title,
                artist: "Unknown Artist",
                filePath: title
            };
        }

        // Start polling for player state updates
        public startStatePolling() {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
            }

            console.log("[WinampControls] Starting state polling");

            this.pollingInterval = window.setInterval(async () => {
                try {
                    const state = await this.getCurrentState();
                    if (state) {
                        // Dispatch state update to Flux
                        (FluxDispatcher as any).dispatch({
                            type: "WINAMP_PLAYER_STATE",
                            ...state
                        });
                    }
                } catch (error) {
                    console.error("[WinampControls] Polling error:", error);
                }
            }, 1000) as unknown as number; // Poll every second
        }

        // Stop polling for player state updates
        public stopStatePolling() {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
                console.log("[WinampControls] Stopped state polling");
            }
        }

        // Configure httpQ connection
        public configure(config: Partial<HttpQConfig>) {
            this.config = { ...this.config, ...config };
            console.log(`[WinampControls] Configured httpQ: ${this.config.host}:${this.config.port}`);
        }

        // Test httpQ connection
        public async testConnection(): Promise<boolean> {
            try {
                await this.httpQRequest("version");
                console.log("[WinampControls] httpQ connection successful");
                return true;
            } catch (error) {
                console.error("[WinampControls] httpQ connection failed:", error);
                return false;
            }
        }
    }

    const store = new WinampStore(FluxDispatcher, {
        WINAMP_PLAYER_STATE(e: PlayerState) {
            store.track = e.track;
            store.isPlaying = e.isPlaying ?? false;
            store.volume = e.volume ?? 0;
            store.repeat = e.repeat || "off";
            store.shuffle = e.shuffle ?? false;
            store.position = e.position ?? 0;
            store.isSettingPosition = false;
            store.emitChange();
        }
    } as any);

    // Start polling when store is created
    store.startStatePolling();

    return store;
});
