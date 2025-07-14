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

import "./winampStyles.css";

// import "./visualRefreshWinampStyles.css";
import { classNameFactory } from "@api/Styles";
import { Flex } from "@components/Flex";
import { classes } from "@utils/misc";
import { React, Slider, useEffect, useState, useStateFromStores } from "@webpack/common";

import { settings } from "./";
import { SeekBar } from "./SeekBar";
import { type Track, WinampStore } from "./WinampStore";

const cl = classNameFactory("vc-winamp-");

function msToHuman(ms: number) {
    const minutes = ms / 1000 / 60;
    const m = Math.floor(minutes);
    const s = Math.floor((minutes - m) * 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function Svg(path: string, label: string) {
    return () => (
        <svg
            className={cl("button-icon", label)}
            height="24"
            width="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-label={label}
            focusable={false}
        >
            <path d={path} />
        </svg>
    );
}

// KraXen's icons :yesyes:
// from https://fonts.google.com/icons?icon.style=Rounded&icon.set=Material+Icons
// older material icon style, but still really good
const PlayButton = Svg("M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18c.62-.39.62-1.29 0-1.69L9.54 5.98C8.87 5.55 8 6.03 8 6.82z", "play");
const PauseButton = Svg("M8 19c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2s-2 .9-2 2v10c0 1.1.9 2 2 2zm6-12v10c0 1.1.9 2 2 2s2-.9 2-2V7c0-1.1-.9-2-2-2s-2 .9-2 2z", "pause");
const SkipPrev = Svg("M7 6c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1s-1-.45-1-1V7c0-.55.45-1 1-1zm3.66 6.82l5.77 4.07c.66.47 1.58-.01 1.58-.82V7.93c0-.81-.91-1.28-1.58-.82l-5.77 4.07c-.57.4-.57 1.24 0 1.64z", "previous");
const SkipNext = Svg("M7.58 16.89l5.77-4.07c.56-.4.56-1.24 0-1.63L7.58 7.11C6.91 6.65 6 7.12 6 7.93v8.14c0 .81.91 1.28 1.58.82zM16 7v10c0 .55.45 1 1 1s1-.45 1-1V7c0-.55-.45-1-1-1s-1 .45-1 1z", "next");
const Repeat = Svg("M7 7h10v1.79c0 .45.54.67.85.35l2.79-2.79c.2-.2.2-.51 0-.71l-2.79-2.79c-.31-.31-.85-.09-.85.36V5H6c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1s1-.45 1-1V7zm10 10H7v-1.79c0-.45-.54-.67-.85-.35l-2.79 2.79c-.2.2-.2.51 0 .71l2.79 2.79c.31.31.85.09.85-.36V19h11c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1v3z", "repeat");
const Shuffle = Svg("M10.59 9.17L6.12 4.7c-.39-.39-1.02-.39-1.41 0-.39.39-.39 1.02 0 1.41l4.46 4.46 1.42-1.4zm4.76-4.32l1.19 1.19L4.7 17.88c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0L17.96 7.46l1.19 1.19c.31.31.85.09.85-.36V4.5c0-.28-.22-.5-.5-.5h-3.79c-.45 0-.67.54-.36.85zm-.52 8.56l-1.41 1.41 3.13 3.13-1.2 1.2c-.31.31-.09.85.36.85h3.79c.28 0 .5-.22.5-.5v-3.79c0-.45-.54-.67-.85-.35l-1.19 1.19-3.13-3.14z", "shuffle");
const VolumeIcon = Svg("M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z", "volume");

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            className={cl("button")}
            {...props}
        >
            {props.children}
        </button>
    );
}

function Controls() {
    const [isPlaying, shuffle, repeat, volume] = useStateFromStores(
        [WinampStore],
        () => [WinampStore.isPlaying, WinampStore.shuffle, WinampStore.repeat, WinampStore.volume]
    );

    const [nextRepeat, repeatClassName] = (() => {
        switch (repeat) {
            case "off": return ["playlist", "repeat-off"] as const;
            case "playlist": return ["track", "repeat-playlist"] as const;
            case "track": return ["off", "repeat-track"] as const;
            default: throw new Error(`Invalid repeat state ${repeat}`);
        }
    })();

    // the 1 is using position absolute so it does not make the button jump around
    return (
        <Flex className={cl("button-row")} style={{ gap: 0 }}>
            <Button
                className={classes(cl("button"), cl("shuffle"), cl(shuffle ? "shuffle-on" : "shuffle-off"))}
                onClick={() => WinampStore.setShuffle(!shuffle)}
            >
                <Shuffle />
            </Button>
            <Button onClick={() => {
                settings.store.previousButtonRestartsTrack && WinampStore.position > 3000 ? WinampStore.seek(0) : WinampStore.prev();
            }}>
                <SkipPrev />
            </Button>
            <Button onClick={() => WinampStore.setPlaying(!isPlaying)}>
                {isPlaying ? <PauseButton /> : <PlayButton />}
            </Button>
            <Button onClick={() => WinampStore.next()}>
                <SkipNext />
            </Button>
            <Button
                className={classes(cl("button"), cl("repeat"), cl(repeatClassName))}
                onClick={() => WinampStore.setRepeat(nextRepeat)}
            >
                <Repeat />
            </Button>

        </Flex>
    );
}

function WinampSeekBar() {
    const [isSettingPosition, trackLength, position] = useStateFromStores(
        [WinampStore],
        () => [WinampStore.isSettingPosition, WinampStore.track?.duration, WinampStore.position]
    );

    const [statePosition, setStatePosition] = useState(position);
    const [isDragging, setIsDragging] = useState(false);
    const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

    if (!isDragging && position !== statePosition)
        setStatePosition(position);

    const onChange = (v: number) => {
        if (isSettingPosition) return;

        setStatePosition(v);
        setIsDragging(true);

        // Clear existing timeout
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }

        // Set a new timeout to debounce the seek operation
        const timeout = setTimeout(() => {
            WinampStore.seek(v);
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
        WinampStore.seek(statePosition);
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
                    className={cl("progress-time", "time-right")}
                    style={{ userSelect: "text" }}
                >
                    {msToHuman(trackLength - statePosition)}
                </span>
            </div>
        </div>
    );
}

function TrackInfo({ track }: { track: Track; }) {
    const [coverExpanded, setCoverExpanded] = useState(false);

    const trackName = track.name || "Unknown";
    const artistName = track.artist || "Unknown Artist";

    return (
        <div id={cl("info-wrapper")}>
            <div id={cl("titles")}>
                <div id={cl("song-title")} className={cl("ellipoverflow")}>
                    {trackName}
                </div>
                <div className={cl("ellipoverflow")}>
                    <span className={cl("artist")}>{artistName}</span>
                </div>
            </div>
        </div>
    );
}
function Volume({ volume }: { volume: number; }) {
    return (
        <div id={cl("volume-bar")}>
            <Slider
                className={cl("slider")}
                minValue={0}
                maxValue={100}
                initialValue={volume}
                onValueChange={(v: number) => WinampStore.setVolume(v)}
                onValueRender={(v: number) => `${Math.round(v)}%`}
                hideBubble={false}
            />
        </div>
    );
}
export function Player() {
    const [track, volume, isPlaying, isSettingPosition] = useStateFromStores(
        [WinampStore],
        () => [WinampStore.track, WinampStore.volume, WinampStore.isPlaying, WinampStore.isSettingPosition]
    );

    const [shouldHide, setShouldHide] = useState(false);

    // Hide player if Winamp is not available
    useEffect(() => {
        const isWinampAvailable = track !== null;
        setShouldHide(!isWinampAvailable && !isPlaying);
    }, [track, isPlaying]);

    if (shouldHide || !track) return null;

    return (
        <div id={cl("player")}>
            <TrackInfo track={track} />
            <Volume volume={volume} />
            <Controls />
            <WinampSeekBar />
        </div>
    );
}
