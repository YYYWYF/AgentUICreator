import type { ComponentProps, ReactNode } from "react";
export interface LocaleProviderPluginProps { renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode; children?: ReactNode; }
export function CanonicalLocaleProviderPlugin(props: LocaleProviderPluginProps) { return <>{props.children ?? null}</>; }
