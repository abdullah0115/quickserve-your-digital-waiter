export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _backup_orders_items_20260713: {
        Row: {
          created_at: string | null
          id: string | null
          items: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          items?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          items?: Json | null
        }
        Relationships: []
      }
      business_analytics: {
        Row: {
          avg_order_value: number
          business_id: string
          created_at: string
          date: string
          id: string
          peak_hours: Json | null
          top_selling_items: Json | null
          total_orders: number
          total_revenue: number
        }
        Insert: {
          avg_order_value?: number
          business_id: string
          created_at?: string
          date: string
          id?: string
          peak_hours?: Json | null
          top_selling_items?: Json | null
          total_orders?: number
          total_revenue?: number
        }
        Update: {
          avg_order_value?: number
          business_id?: string
          created_at?: string
          date?: string
          id?: string
          peak_hours?: Json | null
          top_selling_items?: Json | null
          total_orders?: number
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_analytics_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          city: string | null
          country: string
          cover_image_url: string | null
          created_at: string
          cuisine_type: string | null
          description: string | null
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          meta_description: string | null
          meta_title: string | null
          name: string
          owner_id: string
          phone: string | null
          slug: string
          tagline: string | null
          theme_color: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string
          cover_image_url?: string | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          owner_id: string
          phone?: string | null
          slug: string
          tagline?: string | null
          theme_color?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string
          cover_image_url?: string | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          slug?: string
          tagline?: string | null
          theme_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      managed_setup_cities: {
        Row: {
          city: string
        }
        Insert: {
          city: string
        }
        Update: {
          city?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          business_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          name_urdu: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          name_urdu?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          name_urdu?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          business_id: string
          category_id: string | null
          created_at: string
          description: string | null
          description_urdu: string | null
          display_order: number
          id: string
          image_url: string | null
          is_available: boolean
          is_featured: boolean
          name: string
          name_urdu: string | null
          preparation_time: number
          price: number
          updated_at: string
        }
        Insert: {
          business_id: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          description_urdu?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          name: string
          name_urdu?: string | null
          preparation_time?: number
          price: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          description_urdu?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          name?: string
          name_urdu?: string | null
          preparation_time?: number
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          business_id: string | null
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          message: string | null
          order_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message?: string | null
          order_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message?: string | null
          order_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          added_by_name: string
          created_at: string
          id: string
          menu_item_id: string | null
          name: string
          notes: string | null
          order_id: string
          price: number
          quantity: number
        }
        Insert: {
          added_by_name: string
          created_at?: string
          id?: string
          menu_item_id?: string | null
          name: string
          notes?: string | null
          order_id: string
          price: number
          quantity: number
        }
        Update: {
          added_by_name?: string
          created_at?: string
          id?: string
          menu_item_id?: string | null
          name?: string
          notes?: string | null
          order_id?: string
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          business_id: string
          completed_at: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          id: string
          notes: string | null
          notified_at: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          qr_code_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          table_number: string | null
          token_number: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          qr_code_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_number?: string | null
          token_number: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          qr_code_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_number?: string | null
          token_number?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_configs: {
        Row: {
          analytics_level: string
          currency: string | null
          display_order: number
          features: Json
          has_watermark: boolean
          is_active: boolean
          max_orders_per_day: number | null
          max_tables: number | null
          monthly_price: number
          name: string
          paddle_price_id: string | null
          paddle_setup_fee_price_id: string | null
          plan_type: string
          requires_city_match: boolean
          scan_menu_limit: number | null
          setup_fee: number
          support_level: string
        }
        Insert: {
          analytics_level?: string
          currency?: string | null
          display_order?: number
          features?: Json
          has_watermark?: boolean
          is_active?: boolean
          max_orders_per_day?: number | null
          max_tables?: number | null
          monthly_price?: number
          name: string
          paddle_price_id?: string | null
          paddle_setup_fee_price_id?: string | null
          plan_type: string
          requires_city_match?: boolean
          scan_menu_limit?: number | null
          setup_fee?: number
          support_level?: string
        }
        Update: {
          analytics_level?: string
          currency?: string | null
          display_order?: number
          features?: Json
          has_watermark?: boolean
          is_active?: boolean
          max_orders_per_day?: number | null
          max_tables?: number | null
          monthly_price?: number
          name?: string
          paddle_price_id?: string | null
          paddle_setup_fee_price_id?: string | null
          plan_type?: string
          requires_city_match?: boolean
          scan_menu_limit?: number | null
          setup_fee?: number
          support_level?: string
        }
        Relationships: []
      }
      qr_codes: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          scan_count: number
          table_number: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          scan_count?: number
          table_number: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          scan_count?: number
          table_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket_key: string
          created_at: string
          id: number
        }
        Insert: {
          bucket_key: string
          created_at?: string
          id?: number
        }
        Update: {
          bucket_key?: string
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          business_id: string
          created_at: string
          current_period_end: string | null
          id: string
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          plan_type: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan_type: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan_type?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_type_fkey"
            columns: ["plan_type"]
            isOneToOne: false
            referencedRelation: "plan_configs"
            referencedColumns: ["plan_type"]
          },
        ]
      }
      user_roles: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_order_item: {
        Args: {
          p_added_by_name: string
          p_business_slug: string
          p_menu_item_id: string
          p_notes?: string
          p_order_id: string
          p_quantity: number
        }
        Returns: {
          item_id: string
          item_name: string
          item_price: number
          item_quantity: number
          order_total: number
        }[]
      }
      admin_list_businesses: {
        Args: never
        Returns: {
          created_at: string
          current_period_end: string
          id: string
          is_active: boolean
          name: string
          owner_email: string
          plan_type: string
          slug: string
          subscription_status: string
          trial_ends_at: string
        }[]
      }
      admin_set_business_active: {
        Args: { p_business_id: string; p_is_active: boolean }
        Returns: undefined
      }
      admin_set_subscription: {
        Args: {
          p_business_id: string
          p_current_period_end?: string
          p_plan_type: string
          p_status: string
          p_trial_ends_at?: string
        }
        Returns: undefined
      }
      check_rate_limit: {
        Args: {
          p_bucket_key: string
          p_max_hits: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      create_order_with_items: {
        Args: {
          p_business_slug: string
          p_customer_name: string
          p_customer_phone: string
          p_items: Json
          p_notes: string
          p_order_type: Database["public"]["Enums"]["order_type"]
          p_qr_code_id: string
        }
        Returns: {
          id: string
          token_number: number
          total_amount: number
        }[]
      }
      get_active_order_for_table: {
        Args: { p_qr_code_id: string }
        Returns: {
          business_id: string
          id: string
          status: Database["public"]["Enums"]["order_status"]
          token_number: number
        }[]
      }
      get_active_orders_for_display: {
        Args: { p_business_slug: string }
        Returns: {
          created_at: string
          id: string
          items: Json
          status: Database["public"]["Enums"]["order_status"]
          token_number: number
        }[]
      }
      get_business_watermark: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      get_order_status: {
        Args: {
          p_business_slug: string
          p_customer_phone?: string
          p_order_id?: string
          p_token_number?: number
        }
        Returns: {
          business_id: string
          created_at: string
          customer_name: string
          id: string
          items: Json
          order_type: Database["public"]["Enums"]["order_type"]
          qr_code_id: string
          status: Database["public"]["Enums"]["order_status"]
          table_number: string
          token_number: number
          total_amount: number
        }[]
      }
      get_plan_limits: {
        Args: { p_business_id: string }
        Returns: {
          analytics_level: string
          is_locked: boolean
          max_orders_per_day: number
          max_tables: number
          plan_type: string
          scan_menu_limit: number
          status: string
        }[]
      }
      get_scan_usage: {
        Args: { p_business_id: string }
        Returns: {
          scans_limit: number
          scans_used: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_business_member: {
        Args: { _business_id: string; _user_id: string }
        Returns: boolean
      }
      is_managed_setup_eligible: { Args: { p_city: string }; Returns: boolean }
      resolve_qr_code: {
        Args: { p_qr_id: string }
        Returns: {
          business_id: string
          id: string
          is_active: boolean
          table_number: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "owner" | "staff"
      notification_type: "new_order" | "order_ready" | "order_completed"
      order_status:
        | "pending"
        | "preparing"
        | "ready"
        | "completed"
        | "cancelled"
      order_type: "dine_in" | "takeaway"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "owner", "staff"],
      notification_type: ["new_order", "order_ready", "order_completed"],
      order_status: ["pending", "preparing", "ready", "completed", "cancelled"],
      order_type: ["dine_in", "takeaway"],
    },
  },
} as const
