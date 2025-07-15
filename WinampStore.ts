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

// Advanced TypeScript magic for media control endpoints
type MediaEndpoints = {
    prev: { args: void; result: boolean; };
    next: { args: void; result: boolean; };
    setVolume: { args: number; result: boolean; };
    setPlaying: { args: boolean; result: boolean; };
    setRepeat: { args: RepeatMode; result: boolean; };
    setShuffle: { args: boolean; result: boolean; };
    seek: { args: number; result: boolean; };
};

// Extract endpoint names as union type
type EndpointName = keyof MediaEndpoints;

// Generic type for extracting args from endpoint
type EndpointArgs<T extends EndpointName> = MediaEndpoints[T]["args"];

// Generic type for extracting result from endpoint
type EndpointResult<T extends EndpointName> = MediaEndpoints[T]["result"];

// Store state type for optimistic updates
type StoreState = {
    track: Track | null;
    isPlaying: boolean;
    repeat: RepeatMode;
    shuffle: boolean;
    volume: number;
    mPosition: number;
    _start: number;
};

// State update function type
type StateUpdateFn<T extends EndpointName> = (
    args: EndpointArgs<T>,
    currentState: StoreState
) => Partial<StoreState>;

// Client method type
type ClientMethod<T extends EndpointName> = (
    client: WinampClient,
    args: EndpointArgs<T>
) => Promise<EndpointResult<T>>;

// Media action definition
type MediaAction<T extends EndpointName> = {
    clientMethod: ClientMethod<T>;
    optimisticUpdate: StateUpdateFn<T>;
    errorHandler?: (error: unknown, args: EndpointArgs<T>) => Partial<StoreState>;
};

// The sacred map of all media actions - completely type-safe and generic
const MEDIA_ACTIONS = {
    prev: {
        clientMethod: (client: WinampClient) => client.prev(),
        optimisticUpdate: () => ({}), // No immediate state change needed
    } satisfies MediaAction<"prev">,
    next: {
        clientMethod: (client: WinampClient) => client.next(),
        optimisticUpdate: () => ({}), // No immediate state change needed
    } satisfies MediaAction<"next">,
    setVolume: {
        clientMethod: (client: WinampClient, volume: number) => client.setVolume(volume),
        optimisticUpdate: (volume: number) => ({ volume }),
    } satisfies MediaAction<"setVolume">,
    setPlaying: {
        clientMethod: (client: WinampClient, playing: boolean) => client[playing ? "play" : "pause"](),
        optimisticUpdate: (playing: boolean, state: StoreState) => ({
            isPlaying: playing,
            _start: playing ? Date.now() : state._start
        }),
        errorHandler: (error: unknown, playing: boolean) => ({
            isPlaying: !playing // Revert on error
        })
    } satisfies MediaAction<"setPlaying">,
    setRepeat: {
        clientMethod: (client: WinampClient, state: RepeatMode) => client.setRepeat(state),
        optimisticUpdate: (state: RepeatMode) => ({ repeat: state }),
    } satisfies MediaAction<"setRepeat">,
    setShuffle: {
        clientMethod: (client: WinampClient, state: boolean) => client.setShuffle(state),
        optimisticUpdate: (state: boolean) => ({ shuffle: state }),
    } satisfies MediaAction<"setShuffle">,
    seek: {
        clientMethod: (client: WinampClient, ms: number) => client.seekTo(ms),
        optimisticUpdate: (ms: number) => ({
            mPosition: ms,
            _start: Date.now()
        }),
    } satisfies MediaAction<"seek">,
} as const;

// Type assertion to ensure our map is complete and correct
type _AssertComplete = typeof MEDIA_ACTIONS extends Record<EndpointName, any> ? true : false;

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


        public isPollingEnabled = true; // Track if polling should be active
        public lastConsecutiveFailure: ConsecutiveFailuresError | null = null;

        // Advanced timestamp-based state conflict resolution system
        // Prevents polling from overwriting recent optimistic updates
        // Each optimistic update records its timestamp; polling only updates keys
        // that haven't been optimistically updated after the poll was initiated
        private optimisticUpdateTimestamps = new Map<keyof StoreState, number>();

        // Track expected values for optimistic updates to confirm server state
        private optimisticExpectedValues = new Map<keyof StoreState, any>();

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

        // The ultimate generic media control executor - 100% type-safe and dynamic
        public async executeMediaAction<T extends EndpointName>(
            endpoint: T,
            args: EndpointArgs<T>
        ): Promise<EndpointResult<T>> {
            const action = MEDIA_ACTIONS[endpoint] as MediaAction<T>;

            // Get current state for optimistic update
            const currentState: StoreState = {
                track: this.track,
                isPlaying: this.isPlaying,
                repeat: this.repeat,
                shuffle: this.shuffle,
                volume: this.volume,
                mPosition: this.mPosition,
                _start: this._start
            };

            // Apply optimistic update with timestamp tracking
            const optimisticState = action.optimisticUpdate(args, currentState);
            this.applyStateUpdate(optimisticState, true);

            try {
                // Execute client method with perfect type safety
                const result = await action.clientMethod(this.client, args);

                console.log(`[WinampStore] ${endpoint} completed successfully - polling will confirm state changes`);

                return result;
            } catch (error) {
                console.error(`[WinampControls] Failed to execute ${endpoint}:`, error);

                // Apply error handling if defined
                if (action.errorHandler) {
                    const errorState = action.errorHandler(error, args);
                    this.applyStateUpdate(errorState);
                }

                throw error;
            }
        }

        // Helper to apply state updates and emit changes
        private applyStateUpdate(stateUpdate: Partial<StoreState>, isOptimistic = false) {
            // Track isPlaying changes with stack trace
            if ("isPlaying" in stateUpdate && stateUpdate.isPlaying !== this.isPlaying) {
                const oldValue = this.isPlaying;
                const newValue = stateUpdate.isPlaying;
                console.log(`[WinampStore] isPlaying changed: ${oldValue} → ${newValue} (${isOptimistic ? "optimistic" : "normal"})`);
                console.trace("[WinampStore] isPlaying change stack trace:");
            }

            // Record timestamps and expected values for optimistic updates
            if (isOptimistic) {
                const timestamp = Date.now();
                Object.entries(stateUpdate).forEach(([key, value]) => {
                    const stateKey = key as keyof StoreState;
                    this.optimisticUpdateTimestamps.set(stateKey, timestamp);
                    this.optimisticExpectedValues.set(stateKey, value);
                });
            }

            Object.assign(this, stateUpdate);
            this.emitChange();
        }

        // Get filtered polling update without applying it (for Flux dispatch)
        private getFilteredPollingUpdate(pollingState: Partial<StoreState>, pollInitiatedAt: number): Partial<StoreState> {
            const filteredUpdate: Partial<StoreState> = {};

            Object.entries(pollingState).forEach(([key, value]) => {
                const stateKey = key as keyof StoreState;
                const optimisticTimestamp = this.optimisticUpdateTimestamps.get(stateKey);
                const expectedValue = this.optimisticExpectedValues.get(stateKey);

                if (!optimisticTimestamp || optimisticTimestamp < pollInitiatedAt) {
                    // No optimistic update or optimistic update is older than poll - safe to update
                    (filteredUpdate as any)[key] = value;
                } else {
                    // Check if polling confirms our optimistic update
                    if (expectedValue !== undefined && this.valuesMatch(value, expectedValue)) {
                        // Server confirmed our optimistic update - allow update
                        (filteredUpdate as any)[key] = value;
                    }
                    // If not confirmed, skip this key (no entry in filteredUpdate)
                }
            });

            return filteredUpdate;
        }

        // Apply polling updates with timestamp-based conflict resolution
        private applyPollingUpdate(pollingState: Partial<StoreState>, pollInitiatedAt: number) {
            const filteredUpdate: Partial<StoreState> = {};
            const confirmedKeys: string[] = [];

            Object.entries(pollingState).forEach(([key, value]) => {
                const stateKey = key as keyof StoreState;
                const optimisticTimestamp = this.optimisticUpdateTimestamps.get(stateKey);
                const expectedValue = this.optimisticExpectedValues.get(stateKey);

                if (!optimisticTimestamp || optimisticTimestamp < pollInitiatedAt) {
                    // No optimistic update or optimistic update is older than poll - safe to update
                    if (optimisticTimestamp) {
                        // Remove expired timestamp and expected value
                        this.optimisticUpdateTimestamps.delete(stateKey);
                        this.optimisticExpectedValues.delete(stateKey);
                    }
                    (filteredUpdate as any)[key] = value;
                } else {
                    // Check if polling confirms our optimistic update
                    if (expectedValue !== undefined && this.valuesMatch(value, expectedValue)) {
                        // Server confirmed our optimistic update - clear timestamps and allow update
                        this.optimisticUpdateTimestamps.delete(stateKey);
                        this.optimisticExpectedValues.delete(stateKey);
                        (filteredUpdate as any)[key] = value;
                        confirmedKeys.push(key);
                        console.log(`[WinampStore] Server confirmed optimistic update for '${key}': ${JSON.stringify(value)}`);
                    } else {
                        // Optimistic update is newer than poll and not confirmed - skip this key
                        console.log(`[WinampStore] Skipping polling update for '${key}' due to recent optimistic update (expected: ${JSON.stringify(expectedValue)}, got: ${JSON.stringify(value)})`);
                    }
                }
            });

            if (confirmedKeys.length > 0) {
                console.log("[WinampStore] Confirmed optimistic updates for keys:", confirmedKeys);
            }

            if (Object.keys(filteredUpdate).length > 0) {
                // Track isPlaying changes with stack trace for polling updates
                if ("isPlaying" in filteredUpdate && filteredUpdate.isPlaying !== this.isPlaying) {
                    const oldValue = this.isPlaying;
                    const newValue = filteredUpdate.isPlaying;
                    console.log(`[WinampStore] isPlaying changed via polling: ${oldValue} → ${newValue}`);
                    console.trace("[WinampStore] isPlaying polling change stack trace:");
                }

                Object.assign(this, filteredUpdate);
                this.emitChange();
            }
        }

        // Utility methods for timestamp-based conflict resolution

        // Compare values for optimistic update confirmation
        private valuesMatch(a: any, b: any): boolean {
            // Handle null/undefined
            if (a === null && b === null) return true;
            if (a === undefined && b === undefined) return true;
            if (a === null || b === null || a === undefined || b === undefined) return false;

            // Handle primitives
            if (typeof a !== "object" || typeof b !== "object") {
                return a === b;
            }

            // Handle objects/arrays (deep comparison would be overkill for our use case)
            return JSON.stringify(a) === JSON.stringify(b);
        }

        // Clear expired optimistic timestamps (older than specified age in ms)
        private clearExpiredOptimisticTimestamps(maxAge = 5000) {
            const now = Date.now();
            const expiredKeys: (keyof StoreState)[] = [];

            this.optimisticUpdateTimestamps.forEach((timestamp, key) => {
                if (now - timestamp > maxAge) {
                    expiredKeys.push(key);
                }
            });

            expiredKeys.forEach(key => {
                this.optimisticUpdateTimestamps.delete(key);
                this.optimisticExpectedValues.delete(key);
            });

            if (expiredKeys.length > 0) {
                console.log(`[WinampStore] Cleared ${expiredKeys.length} expired optimistic timestamps:`, expiredKeys);
            }
        }

        // Get current optimistic update state (for debugging)
        public getOptimisticUpdateState(): Record<string, { timestamp: number; age: number; expectedValue: any; }> {
            const now = Date.now();
            const result: Record<string, { timestamp: number; age: number; expectedValue: any; }> = {};

            this.optimisticUpdateTimestamps.forEach((timestamp, key) => {
                result[key] = {
                    timestamp,
                    age: now - timestamp,
                    expectedValue: this.optimisticExpectedValues.get(key)
                };
            });

            return result;
        }

        // executeMediaAction is now the ONE TRUE RULER of all media actions!

        // Get current player state - now much simpler since client provides UI-ready data
        public async getCurrentState(): Promise<PlayerState | null> {
            try {
                const state = await this.client.getPlayerState();

                // Position syncing is now handled by timestamp-based conflict resolution

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

                const pollInitiatedAt = Date.now();

                // Clean up expired optimistic timestamps
                this.clearExpiredOptimisticTimestamps();

                try {
                    const state = await this.getCurrentState();
                    if (state) {
                        // Apply polling update with timestamp-based conflict resolution
                        const pollingState = {
                            track: state.track,
                            volume: state.volume,
                            isPlaying: state.isPlaying,
                            repeat: state.repeat,
                            shuffle: state.shuffle,
                            mPosition: state.position,
                            _start: this.isPlaying ? Date.now() - state.position : this._start
                        };

                        // Get the filtered update that respects optimistic timestamps
                        const filteredFluxUpdate = this.getFilteredPollingUpdate(pollingState, pollInitiatedAt);

                        // Apply the filtered update to the store
                        this.applyPollingUpdate(pollingState, pollInitiatedAt);

                        // Dispatch ONLY the filtered data to Flux to prevent overriding optimistic updates
                        (FluxDispatcher as any).dispatch({
                            type: "WINAMP_PLAYER_STATE",
                            track: filteredFluxUpdate.track ?? this.track,
                            volume: filteredFluxUpdate.volume ?? this.volume,
                            isPlaying: filteredFluxUpdate.isPlaying ?? this.isPlaying,
                            repeat: filteredFluxUpdate.repeat ?? this.repeat,
                            shuffle: filteredFluxUpdate.shuffle ?? this.shuffle,
                            position: filteredFluxUpdate.mPosition ?? this.position,
                            isConnected: state.isConnected
                        });
                    }
                } catch (error) {
                    if (error instanceof ConsecutiveFailuresError) {
                        console.error(`[WinampControls] Stopping polling due to consecutive failures: ${error.message}`);
                        this.lastConsecutiveFailure = error;
                        this.isPollingEnabled = false;

                        // Apply disconnected state with timestamp-based conflict resolution
                        const disconnectedState = {
                            track: null,
                            volume: 0,
                            isPlaying: false,
                            repeat: "off" as RepeatMode,
                            shuffle: false,
                            mPosition: 0,
                            _start: Date.now()
                        };

                        const disconnectedPollTime = Date.now();
                        const filteredDisconnectedUpdate = this.getFilteredPollingUpdate(disconnectedState, disconnectedPollTime);

                        this.applyPollingUpdate(disconnectedState, disconnectedPollTime);

                        // Dispatch ONLY the filtered disconnected state to Flux
                        (FluxDispatcher as any).dispatch({
                            type: "WINAMP_PLAYER_STATE",
                            track: filteredDisconnectedUpdate.track ?? this.track,
                            volume: filteredDisconnectedUpdate.volume ?? this.volume,
                            isPlaying: filteredDisconnectedUpdate.isPlaying ?? this.isPlaying,
                            repeat: filteredDisconnectedUpdate.repeat ?? this.repeat,
                            shuffle: filteredDisconnectedUpdate.shuffle ?? this.shuffle,
                            position: filteredDisconnectedUpdate.mPosition ?? this.position,
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
            // Track isPlaying changes with stack trace for Flux updates
            const oldIsPlaying = store.isPlaying;
            const newIsPlaying = e.isPlaying ?? false;
            if (oldIsPlaying !== newIsPlaying) {
                console.log(`[WinampStore] isPlaying changed via Flux: ${oldIsPlaying} → ${newIsPlaying}`);
                console.trace("[WinampStore] isPlaying Flux change stack trace:");
            }

            store.track = e.track;
            store.isPlaying = newIsPlaying;
            store.volume = e.volume ?? 0;
            store.repeat = e.repeat || "off";
            store.shuffle = e.shuffle ?? false;
            store.position = e.position ?? 0;
            store.emitChange();
        }
    } as any);

    // Start polling when store is created
    store.startStatePolling();

    return store;
});

// Re-export types for convenience
export type { ConsecutiveFailuresError, HTTPQConfig, PlayerState, RepeatMode, Track } from "./WinampClient";
