import { createTheme } from "@mui/material/styles";
import type { Shadows } from "@mui/material/styles";

const customShadows: Shadows = [
  "none", // 0
  "0px 2px 8px rgba(0,0,0,0.05)", // 1
  "0px 4px 20px rgba(0,0,0,0.08)", // 2
  "none", // 3
  "none", // 4
  "none", // 5
  "none", // 6
  "none", // 7
  "none", // 8
  "none", // 9
  "none", // 10
  "none", // 11
  "none", // 12
  "none", // 13
  "none", // 14
  "none", // 15
  "none", // 16
  "none", // 17
  "none", // 18
  "none", // 19
  "none", // 20
  "none", // 21
  "none", // 22
  "none", // 23
  "none", // 24
];

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2563eb", // modern bright blue
    },
    secondary: {
      main: "#0f172a",
    },
    background: {
      default: "#f6f8fa",
      paper: "#ffffff",
    },
    text: {
      primary: "#0f172a",
      secondary: "#475569",
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: "Inter, 'Segoe UI', sans-serif",
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shadows: customShadows,
});

export default theme;