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

        prev() {
            // TODO: Implement API call to go to previous track
            console.log("[WinampControls] Previous track requested");
        }

        next() {
            // TODO: Implement API call to go to next track
            console.log("[WinampControls] Next track requested");
        }

        setVolume(percent: number) {
            // TODO: Implement API call to set volume
            console.log("[WinampControls] Volume set to", percent);
            this.volume = percent;
            this.emitChange();
        }

        setPlaying(playing: boolean) {
            // TODO: Implement API call to play/pause
            console.log("[WinampControls] Playing state set to", playing);
        }

        setRepeat(state: Repeat) {
            // TODO: Implement API call to set repeat mode
            console.log("[WinampControls] Repeat mode set to", state);
        }

        setShuffle(state: boolean) {
            // TODO: Implement API call to set shuffle mode
            console.log("[WinampControls] Shuffle mode set to", state);
            this.shuffle = state;
            this.emitChange();
        }

        seek(ms: number) {
            if (this.isSettingPosition) return Promise.resolve();

            this.isSettingPosition = true;

            // TODO: Implement API call to seek to position
            console.log("[WinampControls] Seeking to", ms);

            return new Promise<void>((resolve, reject) => {
                // Placeholder for actual API call
                setTimeout(() => {
                    this.isSettingPosition = false;
                    resolve();
                }, 100);
            }).catch((e: any) => {
                console.error("[WinampControls] Failed to seek", e);
                this.isSettingPosition = false;
            });
        }

        // TODO: Implement methods to communicate with local Winamp API
        // These will replace the Spotify API calls
        private async _makeApiCall(endpoint: string, method: string = "GET", data?: any) {
            // Placeholder for actual API implementation
            console.log(`[WinampControls] API call: ${method} ${endpoint}`, data);
            return Promise.resolve();
        }

        // TODO: Add method to get current player state from Winamp
        public async getCurrentState(): Promise<PlayerState | null> {
            // Placeholder for getting current state from Winamp
            console.log("[WinampControls] Getting current state");
            return null;
        }

        // TODO: Add method to start polling for player state updates
        public startStatePolling() {
            // Placeholder for starting state polling
            console.log("[WinampControls] Starting state polling");
        }

        // TODO: Add method to stop polling for player state updates
        public stopStatePolling() {
            // Placeholder for stopping state polling
            console.log("[WinampControls] Stopping state polling");
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

    return store;
});
