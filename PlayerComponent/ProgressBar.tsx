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

import { classNameFactory } from "@api/Styles";
import { useEffect, useState, useStateFromStores } from "@webpack/common";

import { SeekBar } from "../SeekBar";
import { WinampStore } from "../WinampStore";
import { PersistentLabel } from "./components/PersistentLabel";

const cl = classNameFactory("vc-winamp-");

function msToHuman(ms: number) {
    const minutes = ms / 1000 / 60;
    const m = Math.floor(minutes);
    const s = Math.floor((minutes - m) * 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ProgressBar() {
    const [trackLength, position] = useStateFromStores(
        [WinampStore],
        () => [WinampStore.track?.duration, WinampStore.position]
    );

    const [statePosition, setStatePosition] = useState(position);
    const [isDragging, setIsDragging] = useState(false);
    const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

    if (!isDragging && position !== statePosition)
        setStatePosition(position);

    const onChange = (v: number) => {
        setStatePosition(v);
        setIsDragging(true);

        // Clear existing timeout
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }

        // Set a new timeout to debounce the seek operation
        const timeout = setTimeout(() => {
            WinampStore.executeMediaAction("seek", v);
        }, 100); // 100ms debounce

        setDebounceTimeout(timeout);
    };

    const onChangeComplete = () => {
        setIsDragging(false);

        // Clear any pending debounced seek and perform final seek
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
            setDebounceTimeout(null);
        }

        // Perform final seek on drag complete
        WinampStore.executeMediaAction("seek", statePosition);
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
            }
        };
    }, [debounceTimeout]);

    if (!trackLength) return null;

    return (
        <PersistentLabel enabled={false} direction="below" label="Progress">
            <div id={cl("progress-bar")}>
                <SeekBar
                    className={cl("slider")}
                    minValue={0}
                    maxValue={trackLength}
                    initialValue={statePosition}
                    onValueChange={onChange}
                    asValueChanges={onChange}
                    onValueRender={msToHuman}
                />
                <div id={cl("progress-text")}>
                    <span
                        className={cl("progress-time", "time-left")}
                        style={{ userSelect: "text" }}
                    >
                        {msToHuman(statePosition)}
                    </span>
                    <span
                        className={cl("progress-time", "progress-divider")}
                        style={{ userSelect: "text" }}
                    >
                        /
                    </span>
                    <span
                        className={cl("progress-time", "time-right")}
                        style={{ userSelect: "text" }}
                    >
                        {msToHuman(trackLength)}
                    </span>
                </div>
            </div>
        </PersistentLabel>
    );
}
