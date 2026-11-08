import { useEffect, useState } from "react";
import {
  CloseWindow,
  IsWindowMaximised,
  MinimiseWindow,
  ToggleFullscreen,
  ToggleMaximiseWindow,
} from "../../../wailsjs/go/main/App";

export function useWindowControls() {
  const [fullscreen, setFullscreen] = useState(false);
  const [maximised, setMaximised] = useState(false);

  useEffect(() => {
    void IsWindowMaximised().then(setMaximised).catch(() => setMaximised(false));
  }, []);

  async function toggleFullscreen() {
    setFullscreen(await ToggleFullscreen());
  }

  async function toggleMaximise() {
    await ToggleMaximiseWindow();
    window.setTimeout(() => {
      void IsWindowMaximised().then(setMaximised).catch(() => setMaximised(false));
    }, 80);
  }

  return {
    fullscreen,
    maximised,
    close: CloseWindow,
    minimise: MinimiseWindow,
    toggleFullscreen,
    toggleMaximise,
  };
}
