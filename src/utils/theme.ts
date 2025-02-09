import { createGlobalStyle, css } from "styled-components";
import type { DisplayTheme } from "@arconnect/components";
import { useEffect, useState } from "react";
import useSetting from "~settings/hook";

// import fonts
import manropeLight from "url:/assets/fonts/Manrope-Light.woff2";
import manropeRegular from "url:/assets/fonts/Manrope-Regular.woff2";
import manropeMedium from "url:/assets/fonts/Manrope-Medium.woff2";
import manropeSemiBold from "url:/assets/fonts/Manrope-SemiBold.woff2";
import manropeBold from "url:/assets/fonts/Manrope-Bold.woff2";
import manropeExtraBold from "url:/assets/fonts/Manrope-ExtraBold.woff2";

type ThemeSetting = "light" | "dark" | "system";

/**
 * Determinates the theme of the UI
 */
export function useTheme() {
  const [theme] = useSetting<ThemeSetting>("display_theme");
  const [displayTheme, setDisplayTheme] = useState<DisplayTheme>("light");

  useEffect(() => {
    if (theme !== "system") {
      return setDisplayTheme(theme);
    }

    // match theme
    const darkModePreference = window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

    setDisplayTheme(darkModePreference.matches ? "dark" : "light");

    // listen for system theme changes
    const listener = (e: MediaQueryListEvent) =>
      setDisplayTheme(e.matches ? "dark" : "light");

    darkModePreference.addEventListener("change", listener);

    return () => darkModePreference.removeEventListener("change", listener);
  }, [theme]);

  return displayTheme;
}

export const GlobalStyle = createGlobalStyle`
  @font-face {
    font-family: "ManropeLocal";
    font-style: normal;
    font-weight: 300;
    src: url(${manropeLight}) format('woff2');
  }

  @font-face {
    font-family: "ManropeLocal";
    font-style: normal;
    font-weight: 400;
    src: url(${manropeRegular}) format('woff2');
  }

  @font-face {
    font-family: "ManropeLocal";
    font-style: normal;
    font-weight: 500;
    src: url(${manropeMedium}) format('woff2');
  }

  @font-face {
    font-family: "ManropeLocal";
    font-style: normal;
    font-weight: 600;
    src: url(${manropeSemiBold}) format('woff2');
  }

  @font-face {
    font-family: "ManropeLocal";
    font-style: normal;
    font-weight: 600;
    src: url(${manropeBold}) format('woff2');
  }

  @font-face {
    font-family: "ManropeLocal";
    font-style: normal;
    font-weight: 700;
    src: url(${manropeExtraBold}) format('woff2');
  }

  body {
    margin: 0;
    padding: 0;
    min-height: 500px;
    transition: background-color .23s ease-in-out;
  }

  body, button, input, select, textarea {
    font-family: "ManropeLocal", "Manrope VF", "Manrope", sans-serif !important;
  }

  ::selection {
    background-color: rgba(${(props) => props.theme.theme}, .6);
    color: #fff;
  }
`;

/**
 * Hover effect css
 * Applies a slight hue to the background of
 * the element without using background-color
 */
export const hoverEffect = css`
  z-index: 1;

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    overflow: hidden;
    z-index: -1;
    transform: translate(-50%, -50%);
    transition: background-color 0.35s ease;
  }

  &:hover::after {
    background-color: rgba(${(props) => props.theme.theme}, 0.1);
  }

  &:active::after {
    background-color: rgba(${(props) => props.theme.theme}, 0.15);
  }
`;
