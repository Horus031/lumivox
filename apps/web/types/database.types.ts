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
  public: {
    Tables: {
      ai_insight_cards: {
        Row: {
          confidence_note: string
          created_at: string
          deadline_risk_prediction_id: string | null
          evidence: Json
          generation_metadata: Json
          id: string
          insight_type: Database["public"]["Enums"]["ai_insight_type"]
          llm_model: string
          llm_provider: string
          native_task_risk_assessment_id: string | null
          prompt_version: string
          recommended_actions: Json
          risk_interpretation: string
          structured_output_schema_version: string
          summary: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          confidence_note: string
          created_at?: string
          deadline_risk_prediction_id?: string | null
          evidence?: Json
          generation_metadata?: Json
          id?: string
          insight_type: Database["public"]["Enums"]["ai_insight_type"]
          llm_model: string
          llm_provider?: string
          native_task_risk_assessment_id?: string | null
          prompt_version?: string
          recommended_actions?: Json
          risk_interpretation: string
          structured_output_schema_version?: string
          summary: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          confidence_note?: string
          created_at?: string
          deadline_risk_prediction_id?: string | null
          evidence?: Json
          generation_metadata?: Json
          id?: string
          insight_type?: Database["public"]["Enums"]["ai_insight_type"]
          llm_model?: string
          llm_provider?: string
          native_task_risk_assessment_id?: string | null
          prompt_version?: string
          recommended_actions?: Json
          risk_interpretation?: string
          structured_output_schema_version?: string
          summary?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_insight_cards_deadline_risk_prediction_id_fkey"
            columns: ["deadline_risk_prediction_id"]
            isOneToOne: true
            referencedRelation: "deadline_risk_predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insight_cards_native_task_risk_assessment_id_fkey"
            columns: ["native_task_risk_assessment_id"]
            isOneToOne: true
            referencedRelation: "native_task_risk_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insight_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_risk_feature_attributions: {
        Row: {
          absolute_rank: number
          created_at: string
          effect: Database["public"]["Enums"]["feature_attribution_effect"]
          feature_name: string
          feature_value: number
          id: string
          prediction_id: string
          shap_value: number
        }
        Insert: {
          absolute_rank: number
          created_at?: string
          effect: Database["public"]["Enums"]["feature_attribution_effect"]
          feature_name: string
          feature_value: number
          id?: string
          prediction_id: string
          shap_value: number
        }
        Update: {
          absolute_rank?: number
          created_at?: string
          effect?: Database["public"]["Enums"]["feature_attribution_effect"]
          feature_name?: string
          feature_value?: number
          id?: string
          prediction_id?: string
          shap_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deadline_risk_feature_attributions_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "deadline_risk_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_risk_prediction_explanations: {
        Row: {
          baseline_expected_value: number
          created_at: string
          explanation_method: string
          explanation_version: string
          id: string
          prediction_id: string
          top_negative_contributors: Json
          top_positive_contributors: Json
        }
        Insert: {
          baseline_expected_value: number
          created_at?: string
          explanation_method?: string
          explanation_version?: string
          id?: string
          prediction_id: string
          top_negative_contributors?: Json
          top_positive_contributors?: Json
        }
        Update: {
          baseline_expected_value?: number
          created_at?: string
          explanation_method?: string
          explanation_version?: string
          id?: string
          prediction_id?: string
          top_negative_contributors?: Json
          top_positive_contributors?: Json
        }
        Relationships: [
          {
            foreignKeyName: "deadline_risk_prediction_explanations_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: true
            referencedRelation: "deadline_risk_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_risk_predictions: {
        Row: {
          created_at: string
          decision_threshold: number
          feature_payload: Json
          id: string
          input_mode: Database["public"]["Enums"]["deadline_risk_input_mode"]
          model_version_id: string
          predicted_label: boolean
          prediction_metadata: Json
          risk_probability: number
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          decision_threshold?: number
          feature_payload: Json
          id?: string
          input_mode: Database["public"]["Enums"]["deadline_risk_input_mode"]
          model_version_id: string
          predicted_label: boolean
          prediction_metadata?: Json
          risk_probability: number
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          decision_threshold?: number
          feature_payload?: Json
          id?: string
          input_mode?: Database["public"]["Enums"]["deadline_risk_input_mode"]
          model_version_id?: string
          predicted_label?: boolean
          prediction_metadata?: Json
          risk_probability?: number
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deadline_risk_predictions_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "ml_model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_risk_predictions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_risk_predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      distraction_events: {
        Row: {
          created_at: string
          distraction_type: Database["public"]["Enums"]["distraction_type"]
          duration_seconds: number
          id: string
          note: string | null
          occurred_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          distraction_type?: Database["public"]["Enums"]["distraction_type"]
          duration_seconds?: number
          id?: string
          note?: string | null
          occurred_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          distraction_type?: Database["public"]["Enums"]["distraction_type"]
          duration_seconds?: number
          id?: string
          note?: string | null
          occurred_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distraction_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "focus_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distraction_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_sessions: {
        Row: {
          actual_focus_minutes: number
          created_at: string
          ended_at: string | null
          id: string
          notes: string | null
          paused_at: string | null
          planned_minutes: number
          self_focus_rating: number | null
          started_at: string
          status: Database["public"]["Enums"]["focus_session_status"]
          task_id: string | null
          total_paused_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_focus_minutes?: number
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          paused_at?: string | null
          planned_minutes: number
          self_focus_rating?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["focus_session_status"]
          task_id?: string | null
          total_paused_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_focus_minutes?: number
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          paused_at?: string | null
          planned_minutes?: number
          self_focus_rating?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["focus_session_status"]
          task_id?: string | null
          total_paused_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focus_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_progress_snapshots: {
        Row: {
          average_progress_percent: number
          created_at: string
          id: string
          period_end: string
          period_start: string
          tracked_goal_count: number
          user_id: string
        }
        Insert: {
          average_progress_percent: number
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          tracked_goal_count?: number
          user_id: string
        }
        Update: {
          average_progress_percent?: number
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          tracked_goal_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_progress_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          description: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          progress_percent: number
          start_date: string | null
          status: Database["public"]["Enums"]["goal_status"]
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id?: string
          progress_percent?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          progress_percent?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_model_versions: {
        Row: {
          algorithm: string
          artifact_path: string
          created_at: string
          explainability_metadata: Json
          feature_schema: Json
          id: string
          is_active: boolean
          metrics: Json
          model_key: string
          training_dataset: string
          updated_at: string
          version: string
        }
        Insert: {
          algorithm: string
          artifact_path: string
          created_at?: string
          explainability_metadata?: Json
          feature_schema?: Json
          id?: string
          is_active?: boolean
          metrics?: Json
          model_key: string
          training_dataset: string
          updated_at?: string
          version: string
        }
        Update: {
          algorithm?: string
          artifact_path?: string
          created_at?: string
          explainability_metadata?: Json
          feature_schema?: Json
          id?: string
          is_active?: boolean
          metrics?: Json
          model_key?: string
          training_dataset?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      native_task_risk_assessments: {
        Row: {
          calculation_version: string
          component_payload: Json
          created_at: string
          deadline_pressure_score: number
          deadline_reliability_risk_score: number
          evidence_payload: Json
          focus_neglect_score: number
          focus_window_days: number
          history_window_days: number
          horizon_days: number
          id: string
          priority_pressure_score: number
          risk_band: Database["public"]["Enums"]["native_task_risk_band"]
          risk_score: number
          task_id: string
          user_id: string
          workload_pressure_score: number
        }
        Insert: {
          calculation_version?: string
          component_payload?: Json
          created_at?: string
          deadline_pressure_score: number
          deadline_reliability_risk_score: number
          evidence_payload?: Json
          focus_neglect_score: number
          focus_window_days?: number
          history_window_days?: number
          horizon_days?: number
          id?: string
          priority_pressure_score: number
          risk_band: Database["public"]["Enums"]["native_task_risk_band"]
          risk_score: number
          task_id: string
          user_id: string
          workload_pressure_score: number
        }
        Update: {
          calculation_version?: string
          component_payload?: Json
          created_at?: string
          deadline_pressure_score?: number
          deadline_reliability_risk_score?: number
          evidence_payload?: Json
          focus_neglect_score?: number
          focus_window_days?: number
          history_window_days?: number
          horizon_days?: number
          id?: string
          priority_pressure_score?: number
          risk_band?: Database["public"]["Enums"]["native_task_risk_band"]
          risk_score?: number
          task_id?: string
          user_id?: string
          workload_pressure_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "native_task_risk_assessments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "native_task_risk_assessments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pbi_snapshots: {
        Row: {
          calculation_version: string
          consistency_score: number
          created_at: string
          deadline_adherence_score: number
          explanation_payload: Json
          focus_quality_score: number
          goal_momentum_score: number
          id: string
          period_end: string
          period_start: string
          personalized_pbi: number
          standard_pbi: number
          task_completion_rate: number
          user_id: string
        }
        Insert: {
          calculation_version?: string
          consistency_score: number
          created_at?: string
          deadline_adherence_score: number
          explanation_payload?: Json
          focus_quality_score: number
          goal_momentum_score: number
          id?: string
          period_end: string
          period_start: string
          personalized_pbi: number
          standard_pbi: number
          task_completion_rate: number
          user_id: string
        }
        Update: {
          calculation_version?: string
          consistency_score?: number
          created_at?: string
          deadline_adherence_score?: number
          explanation_payload?: Json
          focus_quality_score?: number
          goal_momentum_score?: number
          id?: string
          period_end?: string
          period_start?: string
          personalized_pbi?: number
          standard_pbi?: number
          task_completion_rate?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbi_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pbi_weight_profiles: {
        Row: {
          consistency_weight: number
          created_at: string
          deadline_adherence_weight: number
          focus_quality_weight: number
          goal_momentum_weight: number
          id: string
          task_completion_weight: number
          updated_at: string
          user_id: string
        }
        Insert: {
          consistency_weight?: number
          created_at?: string
          deadline_adherence_weight?: number
          focus_quality_weight?: number
          goal_momentum_weight?: number
          id?: string
          task_completion_weight?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          consistency_weight?: number
          created_at?: string
          deadline_adherence_weight?: number
          focus_quality_weight?: number
          goal_momentum_weight?: number
          id?: string
          task_completion_weight?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbi_weight_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      reward_ledger: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["reward_event_type"]
          id: string
          occurred_at: string
          reward_note: string
          source_key: string
          source_payload: Json
          token_delta: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["reward_event_type"]
          id?: string
          occurred_at: string
          reward_note: string
          source_key: string
          source_payload?: Json
          token_delta: number
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["reward_event_type"]
          id?: string
          occurred_at?: string
          reward_note?: string
          source_key?: string
          source_payload?: Json
          token_delta?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_room_members: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          left_at: string | null
          membership_status: Database["public"]["Enums"]["study_room_member_status"]
          role: Database["public"]["Enums"]["study_room_member_role"]
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          membership_status?: Database["public"]["Enums"]["study_room_member_status"]
          role?: Database["public"]["Enums"]["study_room_member_role"]
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          membership_status?: Database["public"]["Enums"]["study_room_member_status"]
          role?: Database["public"]["Enums"]["study_room_member_role"]
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_room_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          room_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          room_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_room_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_rooms: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          invite_code: string
          max_participants: number
          owner_id: string
          realtime_topic: string | null
          status: Database["public"]["Enums"]["study_room_status"]
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["study_room_visibility"]
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          max_participants?: number
          owner_id: string
          realtime_topic?: string | null
          status?: Database["public"]["Enums"]["study_room_status"]
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["study_room_visibility"]
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          max_participants?: number
          owner_id?: string
          realtime_topic?: string | null
          status?: Database["public"]["Enums"]["study_room_status"]
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["study_room_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "study_rooms_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          estimated_minutes: number | null
          goal_id: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          goal_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          goal_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_engagement_stats: {
        Row: {
          calculation_version: string
          completed_focus_sessions_total: number
          completed_tasks_total: number
          created_at: string
          current_streak_days: number
          latest_active_study_date: string | null
          longest_streak_days: number
          token_balance: number
          tokens_earned_last_7d: number
          total_tokens_earned: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calculation_version?: string
          completed_focus_sessions_total?: number
          completed_tasks_total?: number
          created_at?: string
          current_streak_days?: number
          latest_active_study_date?: string | null
          longest_streak_days?: number
          token_balance?: number
          tokens_earned_last_7d?: number
          total_tokens_earned?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          calculation_version?: string
          completed_focus_sessions_total?: number
          completed_tasks_total?: number
          created_at?: string
          current_streak_days?: number
          latest_active_study_date?: string | null
          longest_streak_days?: number
          token_balance?: number
          tokens_earned_last_7d?: number
          total_tokens_earned?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_engagement_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reflection_cards: {
        Row: {
          confidence_note: string
          created_at: string
          generation_metadata: Json
          id: string
          llm_model: string
          llm_provider: string
          next_week_actions: Json
          prompt_version: string
          reflection_id: string
          reflection_interpretation: string
          structured_output_schema_version: string
          summary: string
          title: string
          updated_at: string
          user_id: string
          watchouts: Json
          wins: Json
        }
        Insert: {
          confidence_note: string
          created_at?: string
          generation_metadata?: Json
          id?: string
          llm_model: string
          llm_provider?: string
          next_week_actions?: Json
          prompt_version?: string
          reflection_id: string
          reflection_interpretation: string
          structured_output_schema_version?: string
          summary: string
          title: string
          updated_at?: string
          user_id: string
          watchouts?: Json
          wins?: Json
        }
        Update: {
          confidence_note?: string
          created_at?: string
          generation_metadata?: Json
          id?: string
          llm_model?: string
          llm_provider?: string
          next_week_actions?: Json
          prompt_version?: string
          reflection_id?: string
          reflection_interpretation?: string
          structured_output_schema_version?: string
          summary?: string
          title?: string
          updated_at?: string
          user_id?: string
          watchouts?: Json
          wins?: Json
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reflection_cards_reflection_id_fkey"
            columns: ["reflection_id"]
            isOneToOne: true
            referencedRelation: "weekly_reflections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reflection_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reflections: {
        Row: {
          calculation_version: string
          comparison_payload: Json
          created_at: string
          current_metrics: Json
          current_window_end: string
          current_window_start: string
          evidence_payload: Json
          id: string
          previous_metrics: Json
          previous_window_end: string
          previous_window_start: string
          reflection_direction: Database["public"]["Enums"]["weekly_reflection_direction"]
          user_id: string
        }
        Insert: {
          calculation_version?: string
          comparison_payload?: Json
          created_at?: string
          current_metrics?: Json
          current_window_end: string
          current_window_start: string
          evidence_payload?: Json
          id?: string
          previous_metrics?: Json
          previous_window_end: string
          previous_window_start: string
          reflection_direction: Database["public"]["Enums"]["weekly_reflection_direction"]
          user_id: string
        }
        Update: {
          calculation_version?: string
          comparison_payload?: Json
          created_at?: string
          current_metrics?: Json
          current_window_end?: string
          current_window_start?: string
          evidence_payload?: Json
          id?: string
          previous_metrics?: Json
          previous_window_end?: string
          previous_window_start?: string
          reflection_direction?: Database["public"]["Enums"]["weekly_reflection_direction"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reflections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_study_room_presence_topic: {
        Args: { p_topic: string; p_user_id?: string }
        Returns: boolean
      }
      can_access_study_room_realtime_topic: {
        Args: { p_topic: string; p_user_id?: string }
        Returns: boolean
      }
      can_view_study_room_peer_profile: {
        Args: { p_profile_id: string; p_viewer_id?: string }
        Returns: boolean
      }
      create_study_room: {
        Args: {
          p_description?: string
          p_max_participants?: number
          p_title: string
          p_visibility?: Database["public"]["Enums"]["study_room_visibility"]
        }
        Returns: string
      }
      is_active_study_room_member: {
        Args: { p_room_id: string; p_user_id?: string }
        Returns: boolean
      }
      join_study_room: {
        Args: { p_invite_code?: string; p_room_id: string }
        Returns: string
      }
      join_study_room_by_code: {
        Args: { p_invite_code: string }
        Returns: string
      }
      leave_study_room: { Args: { p_room_id: string }; Returns: undefined }
    }
    Enums: {
      ai_insight_type: "deadline_risk" | "native_task_risk"
      deadline_risk_input_mode:
        | "oulad_compatible_features"
        | "lumivox_native_features"
      distraction_type:
        | "social_media"
        | "messaging"
        | "external_interrupt"
        | "fatigue"
        | "other"
      feature_attribution_effect:
        | "increases_risk"
        | "decreases_risk"
        | "neutral"
      focus_session_status: "ongoing" | "paused" | "completed" | "cancelled"
      goal_status: "active" | "completed" | "paused" | "archived"
      goal_type: "short_term" | "long_term"
      native_task_risk_band: "low" | "moderate" | "elevated" | "high"
      reward_event_type:
        | "focus_session_completed"
        | "task_completed"
        | "daily_streak_continued"
        | "streak_milestone_3"
        | "streak_milestone_7"
      study_room_member_role: "owner" | "member"
      study_room_member_status: "active" | "left" | "removed"
      study_room_status: "active" | "archived"
      study_room_visibility: "public" | "private"
      task_priority: "low" | "medium" | "high" | "critical"
      task_status:
        | "todo"
        | "in_progress"
        | "completed"
        | "overdue"
        | "cancelled"
      weekly_reflection_direction:
        | "improving"
        | "stable"
        | "mixed"
        | "needs_attention"
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
  public: {
    Enums: {
      ai_insight_type: ["deadline_risk", "native_task_risk"],
      deadline_risk_input_mode: [
        "oulad_compatible_features",
        "lumivox_native_features",
      ],
      distraction_type: [
        "social_media",
        "messaging",
        "external_interrupt",
        "fatigue",
        "other",
      ],
      feature_attribution_effect: [
        "increases_risk",
        "decreases_risk",
        "neutral",
      ],
      focus_session_status: ["ongoing", "paused", "completed", "cancelled"],
      goal_status: ["active", "completed", "paused", "archived"],
      goal_type: ["short_term", "long_term"],
      native_task_risk_band: ["low", "moderate", "elevated", "high"],
      reward_event_type: [
        "focus_session_completed",
        "task_completed",
        "daily_streak_continued",
        "streak_milestone_3",
        "streak_milestone_7",
      ],
      study_room_member_role: ["owner", "member"],
      study_room_member_status: ["active", "left", "removed"],
      study_room_status: ["active", "archived"],
      study_room_visibility: ["public", "private"],
      task_priority: ["low", "medium", "high", "critical"],
      task_status: ["todo", "in_progress", "completed", "overdue", "cancelled"],
      weekly_reflection_direction: [
        "improving",
        "stable",
        "mixed",
        "needs_attention",
      ],
    },
  },
} as const
