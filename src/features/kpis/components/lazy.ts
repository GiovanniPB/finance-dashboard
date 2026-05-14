import { lazy } from "react";

/**
 * Recharts is ~108kb gzipped. Lazy-loading these chart wrappers ships them
 * in a separate chunk that only loads on dashboard render.
 */
export const HeroRevenueChart = lazy(() => import("./HeroRevenueChart"));
export const RevenueVsResultChart = lazy(() => import("./RevenueVsResultChart"));
export const ExpenseDonut = lazy(() => import("./ExpenseDonut"));
export const YoYBarChart = lazy(() => import("./YoYBarChart"));
export const YoYAreaChart = lazy(() => import("./YoYAreaChart"));
