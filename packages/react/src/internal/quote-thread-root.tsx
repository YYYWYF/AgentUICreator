import { createContext, useContext, type RefObject } from "react";
export const QuoteThreadRootContext = createContext<RefObject<HTMLDivElement | null> | null>(null);
export const useThreadRootElementRef = () => useContext(QuoteThreadRootContext);
