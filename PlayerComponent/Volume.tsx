/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { Slider } from "@webpack/common";

import { WinampStore } from "../WinampStore";

const cl = classNameFactory("vc-winamp-");

export function Volume({ volume }: { volume: number }) {
  return (
    <div id={cl("volume-bar")}>
      <Slider
        className={cl("slider")}
        minValue={0}
        maxValue={100}
        initialValue={volume}
        onValueChange={(v: number) =>
          WinampStore.executeMediaAction("setVolume", v)
        }
        onValueRender={(v: number) => `${Math.round(v)}%`}
        hideBubble={false}
      />
    </div>
  );
}
