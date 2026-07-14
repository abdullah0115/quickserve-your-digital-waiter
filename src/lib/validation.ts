import { z } from "zod";

// Empty string is allowed (field left blank); if non-empty, it must be a real URL.
const optionalUrl = z.union([z.literal(""), z.string().trim().url("Must be a valid URL")]);

const price = z
  .string()
  .trim()
  .min(1, "Price is required")
  .refine((v) => !Number.isNaN(Number(v)), "Price must be a number")
  .refine((v) => Number(v) > 0, "Price must be greater than 0")
  .refine((v) => Number(v) <= 1_000_000, "Price is unrealistically high");

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(100, "Name is too long"),
  tagline: z.string().trim().max(150, "Tagline is too long"),
  city: z.string().trim().max(100, "City name is too long"),
  country: z.enum(["Pakistan", "International"], { errorMap: () => ({ message: "Select a country" }) }),
  cuisine: z.string().trim().max(50, "Cuisine is too long"),
  phone: z.string().trim().max(20, "Phone number is too long"),
});

export const businessSettingsSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(100, "Name is too long"),
  tagline: z.string().trim().max(150, "Tagline is too long"),
  description: z.string().trim().max(1000, "Description is too long"),
  phone: z.string().trim().max(20, "Phone number is too long"),
  address: z.string().trim().max(200, "Address is too long"),
  cover_image_url: optionalUrl,
});

export const menuItemFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().trim().max(500, "Description is too long"),
  price,
  category_id: z.string(),
  image_url: optionalUrl,
  is_featured: z.boolean(),
});

export const qrCodeFormSchema = z.object({
  table_number: z.string().trim().min(1, "Table number is required").max(20, "Table number is too long"),
  label: z.string().trim().max(50, "Label is too long"),
});

export const checkoutFormSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100, "Name is too long"),
  phone: z.string().trim().max(20, "Phone number is too long"),
  notes: z.string().trim().max(300, "Notes are too long"),
});

export function firstZodError(result: { success: boolean; error?: z.ZodError }): string {
  if (result.success || !result.error) return "";
  return result.error.issues[0]?.message ?? "Invalid input";
}
