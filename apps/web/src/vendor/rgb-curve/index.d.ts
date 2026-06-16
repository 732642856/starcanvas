import { CSSProperties } from 'react';
import { ForwardRefExoticComponent } from 'react';
import { MouseEvent as MouseEvent_2 } from 'react';
import { NamedExoticComponent } from 'react';
import { RefAttributes } from 'react';

/**
 * Apply LUT to RGB values
 */
export declare function applyLUT(r: number, g: number, b: number, lut: LUTData): [number, number, number];

/**
 * Catmull-Rom spline interpolation
 * Smoother curves but may overshoot
 */
export declare function catmullRomInterpolation(points: CurvePoint[], x: number): number;

/**
 * Available curve channels
 */
export declare type Channel = 'master' | 'red' | 'green' | 'blue';

/**
 * Channel colors for easy access
 */
export declare const CHANNEL_COLORS: {
    readonly master: "#e0e0e0";
    readonly red: "#ff6b6b";
    readonly green: "#51cf66";
    readonly blue: "#339af0";
};

/**
 * Channel display info
 */
export declare const CHANNEL_INFO: Record<Channel, {
    label: string;
    shortLabel: string;
}>;

/**
 * Points for all channels
 */
export declare type ChannelPoints = Record<Channel, CurvePoint[]>;

/**
 * Get all channels as an array
 */
export declare const CHANNELS: Channel[];

export declare const ChannelTabs: NamedExoticComponent<ChannelTabsProps>;

declare interface ChannelTabsProps {
    activeChannel: Channel;
    onChange: (channel: Channel) => void;
    style?: TabsStyle;
    disabled?: boolean;
}

/**
 * Clamp a value between min and max
 */
export declare function clamp(value: number, min: number, max: number): number;

/**
 * Style configuration for control points
 */
export declare interface ControlPointStyle {
    radius?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    activeFill?: string;
    activeStroke?: string;
    hoverScale?: number;
}

export declare const CurveCanvas: NamedExoticComponent<CurveCanvasProps>;

declare interface CurveCanvasProps {
    width: number;
    height: number;
    points: CurvePoint[];
    channel: Channel;
    gridStyle?: GridStyle;
    curveStyle?: CurveLineStyle;
    controlPointStyle?: ControlPointStyle;
    histogramStyle?: HistogramStyle;
    histogramData?: Uint8Array;
    wrapperStyle?: CSSProperties;
    disabled?: boolean;
    interpolation?: 'monotone' | 'catmullRom';
    onAddPoint: (channel: Channel, point: CurvePoint) => void;
    onRemovePoint: (channel: Channel, index: number) => void;
    onUpdatePoint: (channel: Channel, index: number, point: CurvePoint) => void;
}

/**
 * Data returned on onChange
 */
export declare interface CurveChangeData {
    /** Current control points for all channels */
    points: ChannelPoints;
    /** Generated LUT for pixel processing */
    lut: LUTData;
    /** Currently active channel */
    activeChannel: Channel;
}

/**
 * Style configuration for curve lines
 */
export declare interface CurveLineStyle {
    color?: string;
    width?: number;
    shadowColor?: string;
    shadowBlur?: number;
}

/**
 * A point on the curve
 */
export declare interface CurvePoint {
    x: number;
    y: number;
}

/**
 * Default curve height
 */
export declare const DEFAULT_HEIGHT = 300;

/**
 * Default styles - Dark theme inspired by Lightroom/Premiere Pro
 */
export declare const DEFAULT_STYLES: Required<RGBCurveStyles>;

/**
 * Default curve width
 */
export declare const DEFAULT_WIDTH = 300;

/**
 * Generate LUT for a single channel
 */
export declare function generateChannelLUT(points: CurvePoint[], interpolation?: 'monotone' | 'catmullRom'): Uint8Array;

/**
 * Generate LUT for all channels
 */
export declare function generateLUT(channelPoints: ChannelPoints, interpolation?: 'monotone' | 'catmullRom'): LUTData;

/**
 * Get default points for all channels
 */
export declare function getDefaultChannelPoints(): ChannelPoints;

/**
 * Default points for a curve (diagonal line from 0,0 to 255,255)
 */
export declare function getDefaultPoints(): CurvePoint[];

/**
 * Style configuration for the grid
 */
export declare interface GridStyle {
    color?: string;
    lineWidth?: number;
    subdivisions?: number;
    showDiagonal?: boolean;
    diagonalColor?: string;
}

/**
 * Style configuration for histogram
 */
export declare interface HistogramStyle {
    show?: boolean;
    opacity?: number;
    fillColor?: string;
}

/**
 * LUT (Look Up Table) for all channels - 256 values each
 */
export declare interface LUTData {
    master: Uint8Array;
    red: Uint8Array;
    green: Uint8Array;
    blue: Uint8Array;
}

/**
 * Monotone cubic spline interpolation
 * This ensures the curve doesn't overshoot between control points
 * Based on Fritsch-Carlson method
 */
export declare function monotoneCubicInterpolation(points: CurvePoint[], x: number): number;

export declare const RGBCurve: ForwardRefExoticComponent<RGBCurveProps & RefAttributes<RGBCurveRef>>;

/**
 * Props for the RGBCurve component
 */
export declare interface RGBCurveProps {
    /** Width of the curve editor */
    width?: number;
    /** Height of the curve editor */
    height?: number;
    /** Initial points for all channels */
    defaultPoints?: Partial<ChannelPoints>;
    /** Controlled points (makes component controlled) */
    points?: Partial<ChannelPoints>;
    /** Default active channel */
    defaultChannel?: Channel;
    /** Controlled active channel */
    activeChannel?: Channel;
    /** Callback when curve changes */
    onChange?: (data: CurveChangeData) => void;
    /** Callback when active channel changes */
    onChannelChange?: (channel: Channel) => void;
    /** Custom styles */
    styles?: RGBCurveStyles;
    /** Show/hide channel tabs */
    showTabs?: boolean;
    /** Show/hide histogram */
    showHistogram?: boolean;
    /** Histogram data (256 values) */
    histogramData?: Uint8Array;
    /** Disable interaction */
    disabled?: boolean;
    /** Class name for container */
    className?: string;
    /** Interpolation type */
    interpolation?: 'monotone' | 'catmullRom';
}

/**
 * Ref methods exposed by RGBCurve
 */
export declare interface RGBCurveRef {
    /** Reset all curves to default (diagonal) */
    reset: () => void;
    /** Reset a specific channel */
    resetChannel: (channel: Channel) => void;
    /** Get current LUT data */
    getLUT: () => LUTData;
    /** Get current points */
    getPoints: () => ChannelPoints;
    /** Set points programmatically */
    setPoints: (points: Partial<ChannelPoints>) => void;
}

/**
 * Complete style configuration
 */
export declare interface RGBCurveStyles {
    /** Container styles */
    container?: CSSProperties;
    /** Canvas wrapper styles */
    canvasWrapper?: CSSProperties;
    /** Grid appearance */
    grid?: GridStyle;
    /** Curve line styles per channel */
    curve?: {
        master?: CurveLineStyle;
        red?: CurveLineStyle;
        green?: CurveLineStyle;
        blue?: CurveLineStyle;
    };
    /** Control point appearance */
    controlPoint?: ControlPointStyle;
    /** Channel tabs appearance */
    tabs?: TabsStyle;
    /** Histogram appearance */
    histogram?: HistogramStyle;
}

/**
 * Sort points by x coordinate
 */
export declare function sortPoints(points: CurvePoint[]): CurvePoint[];

/**
 * Style configuration for channel tabs
 */
export declare interface TabsStyle {
    background?: string;
    borderRadius?: number;
    gap?: number;
    tab?: {
        padding?: string;
        borderRadius?: number;
        fontSize?: number;
        fontWeight?: number | string;
        color?: string;
        background?: string;
        hoverBackground?: string;
        activeColor?: string;
        activeBackground?: string;
    };
}

export declare function useCanvasInteraction(options: UseCanvasInteractionOptions): UseCanvasInteractionReturn;

declare interface UseCanvasInteractionOptions {
    points: CurvePoint[];
    channel: Channel;
    width: number;
    height: number;
    disabled?: boolean;
    onAddPoint: (channel: Channel, point: CurvePoint) => void;
    onRemovePoint: (channel: Channel, index: number) => void;
    onUpdatePoint: (channel: Channel, index: number, point: CurvePoint) => void;
}

declare interface UseCanvasInteractionReturn {
    activePointIndex: number | null;
    hoveredPointIndex: number | null;
    handleMouseDown: (e: MouseEvent_2<HTMLCanvasElement>) => void;
    handleMouseMove: (e: MouseEvent_2<HTMLCanvasElement>) => void;
    handleMouseUp: () => void;
    handleMouseLeave: () => void;
    handleDoubleClick: (e: MouseEvent_2<HTMLCanvasElement>) => void;
}

export declare function useCurvePoints(options?: UseCurvePointsOptions): UseCurvePointsReturn;

declare interface UseCurvePointsOptions {
    defaultPoints?: Partial<ChannelPoints>;
    controlledPoints?: Partial<ChannelPoints>;
    interpolation?: 'monotone' | 'catmullRom';
    onChange?: (points: ChannelPoints, lut: LUTData) => void;
}

declare interface UseCurvePointsReturn {
    points: ChannelPoints;
    lut: LUTData;
    addPoint: (channel: Channel, point: CurvePoint) => void;
    removePoint: (channel: Channel, index: number) => void;
    updatePoint: (channel: Channel, index: number, point: CurvePoint) => void;
    resetChannel: (channel: Channel) => void;
    resetAll: () => void;
    setChannelPoints: (channel: Channel, points: CurvePoint[]) => void;
    setAllPoints: (points: Partial<ChannelPoints>) => void;
}

export { }
