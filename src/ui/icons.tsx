import { forwardRef } from "react";
import type { ComponentType, RefAttributes } from "react";
import type { IconComponent, IconProps } from "reicon-react";
import {
  Activity2,
  AlertTriangle as RAlertTriangle,
  ArrowDown as RArrowDown,
  Box as RBox,
  Keyboard as RKeyboard,
  Settings as RSettings,
  ArrowLeft as RArrowLeft,
  ArrowRight as RArrowRight,
  ArrowUp as RArrowUp,
  Check as RCheck,
  ChevronDown as RChevronDown,
  ChevronRight as RChevronRight,
  ChevronUp as RChevronUp,
  Code as RCode,
  Cursor,
  Eye as REye,
  EyeOff as REyeOff,
  File as RFile,
  Folder as RFolder,
  FolderOpen as RFolderOpen,
  FolderPlus as RFolderPlus,
  Hand as RHand,
  Hashtag,
  Image as RImage,
  Lock as RLock,
  LockOpen as RLockOpen,
  Maximize as RMaximize,
  Minus as RMinus,
  Moon as RMoon,
  More2,
  Pause as RPause,
  Pen,
  Pen2,
  Play as RPlay,
  Plus as RPlus,
  Pointer as RPointer,
  Record,
  Restart as RRestart,
  Search as RSearch,
  Shapes as RShapes,
  Sparkles as RSparkles,
  Stop,
  Sun as RSun,
  Text,
  TextalignCenter2,
  TextalignLeft2,
  TextalignRight2,
  Trash,
  Upload as RUpload,
  X as RX,
} from "reicon-react";

// The app-wide icon component shape (reicon icons, filled by default).
export type AppIcon = ComponentType<IconProps & RefAttributes<SVGSVGElement>>;

// Bind an icon to the Filled weight while keeping all props overridable.
// reicon injects an inline `style.color: currentColor` which beats Tailwind
// text-* classes on the svg — suppress it (unless a color prop is passed)
// so classes control the tint, like lucide did.
export function filled(Icon: IconComponent): AppIcon {
  const C = forwardRef<SVGSVGElement, IconProps>(
    ({ style, color, ...props }, ref) => (
      <Icon
        ref={ref}
        weight="Filled"
        color={color}
        style={color ? style : { color: undefined, ...style }}
        {...props}
      />
    )
  );
  C.displayName = `Filled(${Icon.displayName ?? "Icon"})`;
  return C;
}

// Exported under the identifiers components already use, so swapping the
// icon set stays a one-line import change per file.
export const Activity = filled(Activity2);
export const AlertTriangle = filled(RAlertTriangle);
export const AlignCenter = filled(TextalignCenter2);
export const AlignLeft = filled(TextalignLeft2);
export const AlignRight = filled(TextalignRight2);
export const ArrowDown = filled(RArrowDown);
export const ArrowLeft = filled(RArrowLeft);
export const ArrowRight = filled(RArrowRight);
export const ArrowUp = filled(RArrowUp);
export const Box = filled(RBox);
export const Check = filled(RCheck);
export const ChevronDown = filled(RChevronDown);
export const ChevronRight = filled(RChevronRight);
export const ChevronUp = filled(RChevronUp);
export const ChevronsDown = filled(RArrowDown);
export const ChevronsUp = filled(RArrowUp);
export const Circle = filled(Record);
export const Code2 = filled(RCode);
export const Eye = filled(REye);
export const EyeOff = filled(REyeOff);
export const File = filled(RFile);
export const Folder = filled(RFolder);
export const FolderOpen = filled(RFolderOpen);
export const FolderPlus = filled(RFolderPlus);
export const Hand = filled(RHand);
export const Hash = filled(Hashtag);
export const Image = filled(RImage);
export const Keyboard = filled(RKeyboard);
export const Lock = filled(RLock);
export const LockOpen = filled(RLockOpen);
export const Maximize = filled(RMaximize);
export const Minus = filled(RMinus);
export const Moon = filled(RMoon);
export const MoreVertical = filled(More2);
export const MousePointer2 = filled(Cursor);
export const Pause = filled(RPause);
export const PenLine = filled(Pen);
export const Pencil = filled(Pen2);
export const Plus = filled(RPlus);
export const Play = filled(RPlay);
export const Pointer = filled(RPointer);
export const Search = filled(RSearch);
export const Restart = filled(RRestart);
export const Settings = filled(RSettings);
export const Shapes = filled(RShapes);
export const Sparkles = filled(RSparkles);
export const Square = filled(Stop);
export const Sun = filled(RSun);
export const Trash2 = filled(Trash);
export const Type = filled(Text);
export const Upload = filled(RUpload);
export const X = filled(RX);
