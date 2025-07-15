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

import { ConsecutiveFailuresError, type HTTPQConfig, type PlayerState, type RepeatMode, type Track, vencordFetch, WinampClient } from "./WinampClient";

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
        public isPollingEnabled = true; // Track if polling should be active
        public lastConsecutiveFailure: ConsecutiveFailuresError | null = null;

        private config: HTTPQConfig = {
            host: "127.0.0.1",
            port: 4800,
            password: "pass"
        };

        private client: WinampClient;
        private pollingInterval: number | null = null;

        constructor(dispatcher: any, actionHandlers: any) {
            super(dispatcher, actionHandlers);
            this.client = new WinampClient(vencordFetch, this.config);
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
            this.isPollingEnabled = true;
            this.lastConsecutiveFailure = null;

            this.pollingInterval = window.setInterval(async () => {
                if (!this.isPollingEnabled) {
                    return;
                }

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
                    if (error instanceof ConsecutiveFailuresError) {
                        console.error(`[WinampControls] Stopping polling due to consecutive failures: ${error.message}`);
                        this.lastConsecutiveFailure = error;
                        this.isPollingEnabled = false;

                        // Dispatch disconnected state
                        (FluxDispatcher as any).dispatch({
                            type: "WINAMP_PLAYER_STATE",
                            track: null,
                            volume: 0,
                            isPlaying: false,
                            repeat: "off",
                            shuffle: false,
                            position: 0,
                            isConnected: false
                        });
                    } else {
                        console.error("[WinampControls] Polling error:", error);
                    }
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
            this.isPollingEnabled = false;
        }

        // Attempt to reconnect after consecutive failures
        public async attemptReconnection(): Promise<boolean> {
            try {
                console.log("[WinampControls] Attempting to reconnect...");

                // Reset the failure count on the client
                this.client.resetFailureCount();

                // Test the connection
                const isConnected = await this.client.isConnected();

                if (isConnected) {
                    console.log("[WinampControls] Reconnection successful, resuming polling");
                    this.isPollingEnabled = true;
                    this.lastConsecutiveFailure = null;
                    return true;
                } else {
                    console.log("[WinampControls] Reconnection failed");
                    return false;
                }
            } catch (error) {
                console.error("[WinampControls] Reconnection attempt failed:", error);
                return false;
            }
        }

        // Get status of polling and last failure
        public getPollingStatus(): { isEnabled: boolean; lastFailure: ConsecutiveFailuresError | null; consecutiveFailures: number; } {
            return {
                isEnabled: this.isPollingEnabled,
                lastFailure: this.lastConsecutiveFailure,
                consecutiveFailures: this.client.getConsecutiveFailures()
            };
        }

        // Configure httpQ connection
        public configure(config: Partial<HTTPQConfig>) {
            this.config = { ...this.config, ...config };

            // Recreate the client with new configuration
            this.client = new WinampClient(vencordFetch, this.config);

            // Reset polling state when configuration changes
            this.isPollingEnabled = true;
            this.lastConsecutiveFailure = null;

            this.startStatePolling();
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

        // Test httpQ connection with specific configuration
        public async testConfig(config: HTTPQConfig): Promise<boolean> {
            try {
                return await WinampClient.testConfig(vencordFetch, config);
            } catch (error) {
                console.error("[WinampControls] httpQ configuration test failed:", error);
                return false;
            }
        }

        // Get connection state
        public getConnectionState(): boolean {
            return this.client.getConnectionState();
        }

        // Get current configuration
        public getConfig(): HTTPQConfig {
            return this.client.getConfig();
        }

        // Static method to test connection with given config
        static async testConnection(config: HTTPQConfig): Promise<boolean> {
            try {
                return await WinampClient.testConfig(vencordFetch, config);
            } catch (error) {
                console.error("[WinampStore] Static connection test failed:", error);
                return false;
            }
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
            store.emitChange();
        }
    } as any);

    // Start polling when store is created
    store.startStatePolling();

    return store;
});

// Re-export types for convenience
export type { ConsecutiveFailuresError, HTTPQConfig, PlayerState, RepeatMode, Track } from "./WinampClient";
