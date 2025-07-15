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

import { type PlayerState, type RepeatMode, type Track, vencordFetch, WinampClient } from "./WinampClient";

interface HttpQConfig {
    host: string;
    port: number;
    password?: string;
}

// Don't wanna run before Flux and Dispatcher are ready!
export const WinampStore = proxyLazyWebpack(() => {
    // For some reason ts hates extends Flux.Store
    const { Store } = Flux;

    class WinampStore extends Store {
        public mPosition = 0;
        public _start = 0;

        // Store state now matches the UI-friendly types from winampClient
        public track: Track | null = null;
        public isPlaying = false;
        public repeat: RepeatMode = "off";
        public shuffle = false;
        public volume = 0;

        public isSettingPosition = false;

        private config: HttpQConfig = {
            host: "127.0.0.1",
            port: 4800,
            password: "pass"
        };

        private client: WinampClient;
        private pollingInterval: number | null = null;

        constructor(dispatcher: any, actionHandlers: any) {
            super(dispatcher, actionHandlers);
            this.client = new WinampClient(vencordFetch, this.config.host, this.config.port, this.config.password || "");
        }

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

        async prev() {
            try {
                await this.client.prev();
            } catch (e) {
                console.error("[WinampControls] Failed to go to previous track:", e);
            }
        }

        async next() {
            try {
                await this.client.next();
            } catch (e) {
                console.error("[WinampControls] Failed to go to next track:", e);
            }
        }

        async setVolume(percent: number) {
            // Immediately update UI for responsive feedback
            this.volume = percent;
            this.emitChange();

            try {
                await this.client.setVolume(percent);
                // Confirm the state is still correct after the request
                this.volume = percent;
                this.emitChange();
            } catch (e) {
                console.error("[WinampControls] Failed to set volume:", e);
                // Note: We don't revert volume on error as it's less critical
            }
        }

        async setPlaying(playing: boolean) {
            try {
                if (await this.client[playing ? "play" : "pause"]()) {
                    this.isPlaying = playing;
                    this.emitChange();
                }
            } catch (e) {
                console.error(`[WinampControls] Failed to ${playing ? "play" : "pause"}:`, e);
                // Revert the state on error
            }
        }

        async setRepeat(state: RepeatMode) {
            try {
                await this.client.setRepeat(state);
                this.repeat = state;
                this.emitChange();
            } catch (e) {
                console.error("[WinampControls] Failed to set repeat:", e);
                // Fallback to local tracking
                this.repeat = state;
                this.emitChange();
            }
        }

        async setShuffle(state: boolean) {
            try {
                await this.client.setShuffle(state);
                this.shuffle = state;
                this.emitChange();
            } catch (e) {
                console.error("[WinampControls] Failed to set shuffle:", e);
                // Fallback to local tracking
                this.shuffle = state;
                this.emitChange();
            }
        }

        async seek(ms: number) {

            if (this.isSettingPosition) {
                return Promise.resolve();
            }

            this.isSettingPosition = true;

            try {
                await this.client.seekTo(ms);
                this.position = ms;
                console.log(`[WinampStore] Seek completed successfully to ${ms}ms`);
            } catch (e) {
                console.error("[WinampControls] Failed to seek:", e);
            } finally {
                this.isSettingPosition = false;
                console.log("[WinampStore] Seek operation finished, isSettingPosition reset");
            }
        }

        // Get current player state - now much simpler since client provides UI-ready data
        public async getCurrentState(): Promise<PlayerState | null> {
            try {
                const state = await this.client.getPlayerState();

                // Sync local position tracking with API position
                if (state.track && !this.isSettingPosition) {
                    this.position = state.position;
                }

                return state;
            } catch (error) {
                console.error("[WinampControls] Failed to get current state:", error);
                return null;
            }
        }

        // Get complete playlist
        public async getPlaylist(): Promise<Track[]> {
            try {
                return await this.client.getPlaylist();
            } catch (error) {
                console.error("[WinampControls] Failed to get playlist:", error);
                return [];
            }
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
                        // Dispatch state update to Flux - now using UI-ready state directly
                        (FluxDispatcher as any).dispatch({
                            type: "WINAMP_PLAYER_STATE",
                            track: state.track,
                            volume: state.volume,
                            isPlaying: state.isPlaying,
                            repeat: state.repeat,
                            shuffle: state.shuffle,
                            position: state.position,
                            isConnected: state.isConnected
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

            // Recreate the client with new configuration
            this.client = new WinampClient(vencordFetch, this.config.host, this.config.port, this.config.password || "");

            console.log(`[WinampControls] Configured httpQ: ${this.config.host}:${this.config.port}`);
        }

        // Test httpQ connection
        public async testConnection(): Promise<boolean> {
            try {
                return await this.client.isConnected();
            } catch (error) {
                console.error("[WinampControls] httpQ connection failed:", error);
                return false;
            }
        }

        // Get connection state
        public getConnectionState(): boolean {
            return this.client.getConnectionState();
        }
    }

    const store = new WinampStore(FluxDispatcher, {
        WINAMP_PLAYER_STATE(e: { track: Track | null; volume: number; isPlaying: boolean; repeat: RepeatMode; shuffle: boolean; position: number; isConnected: boolean; }) {
            store.track = e.track;
            store.isPlaying = e.isPlaying ?? false;
            store.volume = e.volume ?? 0;
            store.repeat = e.repeat || "off";
            store.shuffle = e.shuffle ?? false;
            store.position = e.position ?? 0;
            store.isSettingPosition = false;
            (store as any).emitChange();
        }
    } as any);

    // Start polling when store is created
    store.startStatePolling();

    return store;
});

// Re-export types for convenience
export type { PlayerState, RepeatMode, Track } from "./WinampClient";
