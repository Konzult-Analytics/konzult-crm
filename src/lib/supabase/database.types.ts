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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          import_id: string | null
          name: string
          notes: string | null
          track: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          import_id?: string | null
          name: string
          notes?: string | null
          track: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          import_id?: string | null
          name?: string
          notes?: string | null
          track?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_workspace_id_import_id_fkey"
            columns: ["workspace_id", "import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      exit_reasons: {
        Row: {
          active: boolean
          id: string
          label: string
          side: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          label: string
          side: string
          sort_order?: number
          workspace_id?: string
        }
        Update: {
          active?: boolean
          id?: string
          label?: string
          side?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exit_reasons_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          created_by: string | null
          file_hash: string
          file_name: string
          id: string
          journeys_created: number
          kind: string
          organisations_created: number
          people_created: number
          people_updated: number
          touches_created: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_hash: string
          file_name: string
          id?: string
          journeys_created?: number
          kind: string
          organisations_created?: number
          people_created?: number
          people_updated?: number
          touches_created?: number
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_hash?: string
          file_name?: string
          id?: string
          journeys_created?: number
          kind?: string
          organisations_created?: number
          people_created?: number
          people_updated?: number
          touches_created?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_people: {
        Row: {
          interaction_id: string
          person_id: string
          workspace_id: string
        }
        Insert: {
          interaction_id: string
          person_id: string
          workspace_id?: string
        }
        Update: {
          interaction_id?: string
          person_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_people_workspace_id_interaction_id_fkey"
            columns: ["workspace_id", "interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "interaction_people_workspace_id_person_id_fkey"
            columns: ["workspace_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      interactions: {
        Row: {
          campaign_id: string | null
          created_at: string
          created_by: string | null
          created_via: string
          direction: string | null
          id: string
          journey_id: string | null
          meeting_purpose: string | null
          meeting_setting: string | null
          next_step: string | null
          occurred_at: string
          organisation_id: string | null
          outcome: string | null
          summary: string | null
          type: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          created_via?: string
          direction?: string | null
          id?: string
          journey_id?: string | null
          meeting_purpose?: string | null
          meeting_setting?: string | null
          next_step?: string | null
          occurred_at?: string
          organisation_id?: string | null
          outcome?: string | null
          summary?: string | null
          type: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          created_via?: string
          direction?: string | null
          id?: string
          journey_id?: string | null
          meeting_purpose?: string | null
          meeting_setting?: string | null
          next_step?: string | null
          occurred_at?: string
          organisation_id?: string | null
          outcome?: string | null
          summary?: string | null
          type?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_campaign_fkey"
            columns: ["workspace_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "interactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_workspace_id_journey_id_fkey"
            columns: ["workspace_id", "journey_id"]
            isOneToOne: false
            referencedRelation: "journey_overview"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "interactions_workspace_id_journey_id_fkey"
            columns: ["workspace_id", "journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "interactions_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      journey_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          from_status: string | null
          id: string
          journey_id: string
          to_stage: string
          to_status: string
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          from_status?: string | null
          id?: string
          journey_id: string
          to_stage: string
          to_status: string
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          from_status?: string | null
          id?: string
          journey_id?: string
          to_stage?: string
          to_status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_stage_history_workspace_id_journey_id_fkey"
            columns: ["workspace_id", "journey_id"]
            isOneToOne: false
            referencedRelation: "journey_overview"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "journey_stage_history_workspace_id_journey_id_fkey"
            columns: ["workspace_id", "journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      journeys: {
        Row: {
          campaign_id: string | null
          chance_pct: number | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          exit_note: string | null
          exit_reason_id: string | null
          exit_stage: string | null
          fit_budget: string | null
          fit_decision: string | null
          fit_need: string | null
          fit_score: number | null
          fit_timing: string | null
          id: string
          opened_at: string
          organisation_id: string | null
          parked_until: string | null
          person_id: string | null
          referred_by_person_id: string | null
          source_id: string | null
          stage: string
          stage_changed_at: string
          status: string
          track: string
          updated_at: string
          updated_by: string | null
          value_estimate: number | null
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          chance_pct?: number | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          exit_note?: string | null
          exit_reason_id?: string | null
          exit_stage?: string | null
          fit_budget?: string | null
          fit_decision?: string | null
          fit_need?: string | null
          fit_score?: number | null
          fit_timing?: string | null
          id?: string
          opened_at?: string
          organisation_id?: string | null
          parked_until?: string | null
          person_id?: string | null
          referred_by_person_id?: string | null
          source_id?: string | null
          stage?: string
          stage_changed_at?: string
          status?: string
          track: string
          updated_at?: string
          updated_by?: string | null
          value_estimate?: number | null
          workspace_id?: string
        }
        Update: {
          campaign_id?: string | null
          chance_pct?: number | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          exit_note?: string | null
          exit_reason_id?: string | null
          exit_stage?: string | null
          fit_budget?: string | null
          fit_decision?: string | null
          fit_need?: string | null
          fit_score?: number | null
          fit_timing?: string | null
          id?: string
          opened_at?: string
          organisation_id?: string | null
          parked_until?: string | null
          person_id?: string | null
          referred_by_person_id?: string | null
          source_id?: string | null
          stage?: string
          stage_changed_at?: string
          status?: string
          track?: string
          updated_at?: string
          updated_by?: string | null
          value_estimate?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journeys_campaign_fkey"
            columns: ["workspace_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "journeys_workspace_id_exit_reason_id_fkey"
            columns: ["workspace_id", "exit_reason_id"]
            isOneToOne: false
            referencedRelation: "exit_reasons"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "journeys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "journeys_workspace_id_person_id_fkey"
            columns: ["workspace_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "journeys_workspace_id_referred_by_person_id_fkey"
            columns: ["workspace_id", "referred_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "journeys_workspace_id_source_id_fkey"
            columns: ["workspace_id", "source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      organisations: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          size_band: string | null
          turnover_band: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
          workspace_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          size_band?: string | null
          turnover_band?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          workspace_id?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          size_band?: string | null
          turnover_band?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          birthday: string | null
          bni_chapter: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          id: string
          is_bni_member: boolean
          last_name: string | null
          marketing_consent: string
          marketing_consent_at: string | null
          marketing_consent_note: string | null
          notes: string | null
          organisation_id: string | null
          phone: string | null
          role_title: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          birthday?: string | null
          bni_chapter?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_bni_member?: boolean
          last_name?: string | null
          marketing_consent?: string
          marketing_consent_at?: string | null
          marketing_consent_note?: string | null
          notes?: string | null
          organisation_id?: string | null
          phone?: string | null
          role_title?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Update: {
          birthday?: string | null
          bni_chapter?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_bni_member?: boolean
          last_name?: string | null
          marketing_consent?: string
          marketing_consent_at?: string | null
          marketing_consent_note?: string | null
          notes?: string | null
          organisation_id?: string | null
          phone?: string | null
          role_title?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_workspace_id_organisation_id_fkey"
            columns: ["workspace_id", "organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      sources: {
        Row: {
          active: boolean
          grp: string
          id: string
          label: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          active?: boolean
          grp: string
          id?: string
          label: string
          sort_order?: number
          workspace_id?: string
        }
        Update: {
          active?: boolean
          grp?: string
          id?: string
          label?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_on: string
          id: string
          journey_id: string | null
          kind: string
          origin: string
          person_id: string | null
          repeat_rule: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_on: string
          id?: string
          journey_id?: string | null
          kind?: string
          origin?: string
          person_id?: string | null
          repeat_rule?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_on?: string
          id?: string
          journey_id?: string | null
          kind?: string
          origin?: string
          person_id?: string | null
          repeat_rule?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_journey_id_fkey"
            columns: ["workspace_id", "journey_id"]
            isOneToOne: false
            referencedRelation: "journey_overview"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_journey_id_fkey"
            columns: ["workspace_id", "journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_person_id_fkey"
            columns: ["workspace_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      journey_overview: {
        Row: {
          campaign: string | null
          chance_pct: number | null
          closed_at: string | null
          display_name: string | null
          exit_reason: string | null
          exit_side: string | null
          exit_stage: string | null
          fit_score: number | null
          id: string | null
          last_touch_at: string | null
          next_task_on: string | null
          opened_at: string | null
          organisation_id: string | null
          organisation_name: string | null
          parked_until: string | null
          person_id: string | null
          referred_by: string | null
          source: string | null
          stage: string | null
          stage_changed_at: string | null
          status: string | null
          track: string | null
          value_estimate: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journeys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_workspace_id_person_id_fkey"
            columns: ["workspace_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
    }
    Functions: {
      import_contacts: { Args: { p_import: Json; p_rows: Json }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
