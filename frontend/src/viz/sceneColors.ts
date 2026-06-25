// Color tokens for the scene (design doc 12.1). WebGL materials need literal
// colors, so these MIRROR src/styles/tokens.css -- keep them in lockstep.
//
// COLOR MEANS P&L: green = profit, red = loss. The prediction fog + rings are
// deliberately cool WHITE/GREY so they never read as a gain or a loss. Floor,
// axes, and history are neutral grey. No decorative glows (design doc 12 anti-brief).

// neutral / prediction (cool white-grey)
export const WHITE = "#eceef1"; // --text-1  (rings bright, center handle)
export const GREY = "#9aa0a8"; // --text-2  (history, axis labels)
export const GREY_FAINT = "#6b7079"; // --text-3  (floor grid, dim ring)

// P&L (the ONLY colors with meaning)
export const GREEN = "#34d399"; // --g-2  profit
export const GREEN_DEEP = "#10b981"; // --g-1  deeper profit
export const RED = "#f2706f"; // --r-2  loss
export const RED_DEEP = "#e5484d"; // --r-1  deeper loss

// linear-ish RGB triples for vertex colors / shader uniforms
export const GREEN_RGB: [number, number, number] = [0x34 / 255, 0xd3 / 255, 0x99 / 255];
export const GREEN_DEEP_RGB: [number, number, number] = [0x10 / 255, 0xb9 / 255, 0x81 / 255];
export const RED_RGB: [number, number, number] = [0xf2 / 255, 0x70 / 255, 0x6f / 255];
export const RED_DEEP_RGB: [number, number, number] = [0xe5 / 255, 0x48 / 255, 0x4d / 255];

// cool white-grey for the fog (slightly blued so it reads "cloud", not "paper")
export const FOG_RGB: [number, number, number] = [0xe2 / 255, 0xe6 / 255, 0xea / 255];
