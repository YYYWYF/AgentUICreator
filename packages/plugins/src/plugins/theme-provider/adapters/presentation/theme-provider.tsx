import type { ComponentProps, ReactNode } from "react";
export interface ThemeProviderPluginProps { renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode; children?: ReactNode; }
export function CanonicalThemeProviderPlugin(props: ThemeProviderPluginProps) { return <>{props.children ?? null}</>; }
