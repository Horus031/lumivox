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
      ai_content_translations: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          field_name: string
          id: string
          model_name: string | null
          owner_id: string
          provider: string | null
          source_hash: string
          source_locale: string
          status: Database["public"]["Enums"]["ai_translation_status"]
          target_locale: string
          translated_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          field_name: string
          id?: string
          model_name?: string | null
          owner_id: string
          provider?: string | null
          source_hash: string
          source_locale?: string
          status?: Database["public"]["Enums"]["ai_translation_status"]
          target_locale: string
          translated_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          field_name?: string
          id?: string
          model_name?: string | null
          owner_id?: string
          provider?: string | null
          source_hash?: string
          source_locale?: string
          status?: Database["public"]["Enums"]["ai_translation_status"]
          target_locale?: string
          translated_text?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      cms_settings: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
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
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          content_char_count: number
          created_at: string
          document_id: string
          embedding: string | null
          embedding_model: string | null
          id: string
          metadata: Json
          owner_id: string
          status: Database["public"]["Enums"]["document_chunk_status"]
          token_estimate: number
          updated_at: string
        }
        Insert: {
          chunk_index: number
          content: string
          content_char_count: number
          created_at?: string
          document_id: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          metadata?: Json
          owner_id: string
          status?: Database["public"]["Enums"]["document_chunk_status"]
          token_estimate?: number
          updated_at?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          content_char_count?: number
          created_at?: string
          document_id?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          metadata?: Json
          owner_id?: string
          status?: Database["public"]["Enums"]["document_chunk_status"]
          token_estimate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "learning_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_owner_id_fkey"
            columns: ["owner_id"]
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
          source_roadmap_id: string | null
          source_roadmap_node_id: string | null
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
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          progress_percent?: number
          source_roadmap_id?: string | null
          source_roadmap_node_id?: string | null
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
          source_roadmap_id?: string | null
          source_roadmap_node_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_source_roadmap_id_fkey"
            columns: ["source_roadmap_id"]
            isOneToOne: false
            referencedRelation: "learning_roadmaps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_source_roadmap_node_id_fkey"
            columns: ["source_roadmap_node_id"]
            isOneToOne: false
            referencedRelation: "learning_roadmap_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_document_permissions: {
        Row: {
          created_at: string
          created_by: string
          document_id: string
          id: string
          role: Database["public"]["Enums"]["learning_document_permission_role"]
          user_email: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id: string
          id?: string
          role?: Database["public"]["Enums"]["learning_document_permission_role"]
          user_email: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string
          id?: string
          role?: Database["public"]["Enums"]["learning_document_permission_role"]
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_document_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_document_permissions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "learning_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_documents: {
        Row: {
          created_at: string
          extracted_text_preview: string | null
          extracted_text_status: string
          file_name: string
          file_path: string
          file_size_bytes: number
          goal_id: string | null
          id: string
          mime_type: string
          owner_id: string
          task_id: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["learning_document_visibility"]
        }
        Insert: {
          created_at?: string
          extracted_text_preview?: string | null
          extracted_text_status?: string
          file_name: string
          file_path: string
          file_size_bytes: number
          goal_id?: string | null
          id?: string
          mime_type: string
          owner_id: string
          task_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["learning_document_visibility"]
        }
        Update: {
          created_at?: string
          extracted_text_preview?: string | null
          extracted_text_status?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          goal_id?: string | null
          id?: string
          mime_type?: string
          owner_id?: string
          task_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["learning_document_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "learning_documents_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_documents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_roadmap_nodes: {
        Row: {
          created_at: string
          description: string | null
          estimated_hours: number
          id: string
          linked_goal_id: string | null
          linked_task_id: string | null
          metadata: Json
          node_type: Database["public"]["Enums"]["learning_roadmap_node_type"]
          parent_node_id: string | null
          position_x: number
          position_y: number
          priority: number
          roadmap_id: string
          sort_order: number
          suggested_end_date: string | null
          suggested_start_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_hours?: number
          id?: string
          linked_goal_id?: string | null
          linked_task_id?: string | null
          metadata?: Json
          node_type: Database["public"]["Enums"]["learning_roadmap_node_type"]
          parent_node_id?: string | null
          position_x?: number
          position_y?: number
          priority?: number
          roadmap_id: string
          sort_order?: number
          suggested_end_date?: string | null
          suggested_start_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_hours?: number
          id?: string
          linked_goal_id?: string | null
          linked_task_id?: string | null
          metadata?: Json
          node_type?: Database["public"]["Enums"]["learning_roadmap_node_type"]
          parent_node_id?: string | null
          position_x?: number
          position_y?: number
          priority?: number
          roadmap_id?: string
          sort_order?: number
          suggested_end_date?: string | null
          suggested_start_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_roadmap_nodes_linked_goal_id_fkey"
            columns: ["linked_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_roadmap_nodes_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_roadmap_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "learning_roadmap_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_roadmap_nodes_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "learning_roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_roadmaps: {
        Row: {
          ai_latency_ms: number | null
          ai_model: string | null
          ai_provider: string | null
          applied_at: string | null
          archived_at: string | null
          available_weekdays: string[]
          created_at: string
          current_level: Database["public"]["Enums"]["learning_roadmap_level"]
          custom_current_level: string | null
          custom_target_level: string | null
          description: string | null
          end_date: string
          generation_input: Json
          id: string
          minutes_per_study_day: number
          preferred_locale: string
          source_prompt: string | null
          start_date: string
          status: Database["public"]["Enums"]["learning_roadmap_status"]
          study_days_per_week: number
          subject_name: string | null
          target_level: Database["public"]["Enums"]["learning_roadmap_level"]
          title: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_latency_ms?: number | null
          ai_model?: string | null
          ai_provider?: string | null
          applied_at?: string | null
          archived_at?: string | null
          available_weekdays?: string[]
          created_at?: string
          current_level?: Database["public"]["Enums"]["learning_roadmap_level"]
          custom_current_level?: string | null
          custom_target_level?: string | null
          description?: string | null
          end_date: string
          generation_input?: Json
          id?: string
          minutes_per_study_day?: number
          preferred_locale?: string
          source_prompt?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["learning_roadmap_status"]
          study_days_per_week?: number
          subject_name?: string | null
          target_level?: Database["public"]["Enums"]["learning_roadmap_level"]
          title: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_latency_ms?: number | null
          ai_model?: string | null
          ai_provider?: string | null
          applied_at?: string | null
          archived_at?: string | null
          available_weekdays?: string[]
          created_at?: string
          current_level?: Database["public"]["Enums"]["learning_roadmap_level"]
          custom_current_level?: string | null
          custom_target_level?: string | null
          description?: string | null
          end_date?: string
          generation_input?: Json
          id?: string
          minutes_per_study_day?: number
          preferred_locale?: string
          source_prompt?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["learning_roadmap_status"]
          study_days_per_week?: number
          subject_name?: string | null
          target_level?: Database["public"]["Enums"]["learning_roadmap_level"]
          title?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          display_name: string | null
          full_name: string | null
          id: string
          leaderboard_opt_in: boolean
          onboarding_completed: boolean
          role: Database["public"]["Enums"]["app_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          id: string
          leaderboard_opt_in?: boolean
          onboarding_completed?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          id?: string
          leaderboard_opt_in?: boolean
          onboarding_completed?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      rag_chat_messages: {
        Row: {
          content: string
          content_locale: string | null
          context_mode: Database["public"]["Enums"]["rag_context_mode"]
          created_at: string
          id: string
          latency_ms: number | null
          model_name: string | null
          preferred_locale: string | null
          prompt_variant:
            | Database["public"]["Enums"]["rag_prompt_variant"]
            | null
          retrieved_chunk_ids: string[]
          retrieved_context: Json
          role: Database["public"]["Enums"]["rag_message_role"]
          selected_document_ids: string[]
          session_id: string
          top_k: number | null
          user_id: string
        }
        Insert: {
          content: string
          content_locale?: string | null
          context_mode?: Database["public"]["Enums"]["rag_context_mode"]
          created_at?: string
          id?: string
          latency_ms?: number | null
          model_name?: string | null
          preferred_locale?: string | null
          prompt_variant?:
            | Database["public"]["Enums"]["rag_prompt_variant"]
            | null
          retrieved_chunk_ids?: string[]
          retrieved_context?: Json
          role: Database["public"]["Enums"]["rag_message_role"]
          selected_document_ids?: string[]
          session_id: string
          top_k?: number | null
          user_id: string
        }
        Update: {
          content?: string
          content_locale?: string | null
          context_mode?: Database["public"]["Enums"]["rag_context_mode"]
          created_at?: string
          id?: string
          latency_ms?: number | null
          model_name?: string | null
          preferred_locale?: string | null
          prompt_variant?:
            | Database["public"]["Enums"]["rag_prompt_variant"]
            | null
          retrieved_chunk_ids?: string[]
          retrieved_context?: Json
          role?: Database["public"]["Enums"]["rag_message_role"]
          selected_document_ids?: string[]
          session_id?: string
          top_k?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "rag_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_chat_sessions: {
        Row: {
          context_mode: Database["public"]["Enums"]["rag_context_mode"]
          created_at: string
          focus_session_id: string | null
          goal_id: string | null
          id: string
          preferred_locale: string | null
          prompt_variant: Database["public"]["Enums"]["rag_prompt_variant"]
          selected_document_ids: string[]
          task_id: string | null
          title: string | null
          top_k: number
          updated_at: string
          user_id: string
        }
        Insert: {
          context_mode?: Database["public"]["Enums"]["rag_context_mode"]
          created_at?: string
          focus_session_id?: string | null
          goal_id?: string | null
          id?: string
          preferred_locale?: string | null
          prompt_variant?: Database["public"]["Enums"]["rag_prompt_variant"]
          selected_document_ids?: string[]
          task_id?: string | null
          title?: string | null
          top_k?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          context_mode?: Database["public"]["Enums"]["rag_context_mode"]
          created_at?: string
          focus_session_id?: string | null
          goal_id?: string | null
          id?: string
          preferred_locale?: string | null
          prompt_variant?: Database["public"]["Enums"]["rag_prompt_variant"]
          selected_document_ids?: string[]
          task_id?: string | null
          title?: string | null
          top_k?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_chat_sessions_focus_session_id_fkey"
            columns: ["focus_session_id"]
            isOneToOne: false
            referencedRelation: "focus_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_chat_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_chat_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      study_group_weekly_challenges: {
        Row: {
          created_at: string
          created_by: string
          group_id: string
          id: string
          target_completed_tasks: number
          target_focus_minutes: number
          title: string
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by: string
          group_id: string
          id?: string
          target_completed_tasks?: number
          target_focus_minutes?: number
          title?: string
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string
          group_id?: string
          id?: string
          target_completed_tasks?: number
          target_focus_minutes?: number
          title?: string
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_group_weekly_challenges_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
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
          admin_note: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          description: string | null
          id: string
          invite_code: string
          is_private: boolean
          max_participants: number
          owner_id: string
          realtime_topic: string | null
          room_type: Database["public"]["Enums"]["study_room_type"]
          status: Database["public"]["Enums"]["study_room_status"]
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["study_room_visibility"]
        }
        Insert: {
          admin_note?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          is_private?: boolean
          max_participants?: number
          owner_id: string
          realtime_topic?: string | null
          room_type?: Database["public"]["Enums"]["study_room_type"]
          status?: Database["public"]["Enums"]["study_room_status"]
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["study_room_visibility"]
        }
        Update: {
          admin_note?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          is_private?: boolean
          max_participants?: number
          owner_id?: string
          realtime_topic?: string | null
          room_type?: Database["public"]["Enums"]["study_room_type"]
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
          due_date: string | null
          estimated_minutes: number | null
          goal_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          source_roadmap_id: string | null
          source_roadmap_node_id: string | null
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
          due_date?: string | null
          estimated_minutes?: number | null
          goal_id?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          source_roadmap_id?: string | null
          source_roadmap_node_id?: string | null
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
          due_date?: string | null
          estimated_minutes?: number | null
          goal_id?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          source_roadmap_id?: string | null
          source_roadmap_node_id?: string | null
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
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_roadmap_id_fkey"
            columns: ["source_roadmap_id"]
            isOneToOne: false
            referencedRelation: "learning_roadmaps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_roadmap_node_id_fkey"
            columns: ["source_roadmap_node_id"]
            isOneToOne: false
            referencedRelation: "learning_roadmap_nodes"
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
          last_streak_evaluation_at: string | null
          last_valid_activity_date: string | null
          latest_active_study_date: string | null
          longest_streak_days: number
          streak_freeze_started_at: string | null
          streak_restore_deadline_at: string | null
          streak_status: Database["public"]["Enums"]["engagement_streak_status"]
          token_balance: number
          tokens_earned_last_7d: number
          total_tokens_earned: number
          total_tokens_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calculation_version?: string
          completed_focus_sessions_total?: number
          completed_tasks_total?: number
          created_at?: string
          current_streak_days?: number
          last_streak_evaluation_at?: string | null
          last_valid_activity_date?: string | null
          latest_active_study_date?: string | null
          longest_streak_days?: number
          streak_freeze_started_at?: string | null
          streak_restore_deadline_at?: string | null
          streak_status?: Database["public"]["Enums"]["engagement_streak_status"]
          token_balance?: number
          tokens_earned_last_7d?: number
          total_tokens_earned?: number
          total_tokens_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          calculation_version?: string
          completed_focus_sessions_total?: number
          completed_tasks_total?: number
          created_at?: string
          current_streak_days?: number
          last_streak_evaluation_at?: string | null
          last_valid_activity_date?: string | null
          latest_active_study_date?: string | null
          longest_streak_days?: number
          streak_freeze_started_at?: string | null
          streak_restore_deadline_at?: string | null
          streak_status?: Database["public"]["Enums"]["engagement_streak_status"]
          token_balance?: number
          tokens_earned_last_7d?: number
          total_tokens_earned?: number
          total_tokens_spent?: number
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
      user_streak_events: {
        Row: {
          created_at: string
          event_date: string
          event_type: Database["public"]["Enums"]["streak_event_type"]
          id: string
          metadata: Json
          next_status:
            | Database["public"]["Enums"]["engagement_streak_status"]
            | null
          occurred_at: string
          previous_status:
            | Database["public"]["Enums"]["engagement_streak_status"]
            | null
          source_key: string
          token_delta: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_date?: string
          event_type: Database["public"]["Enums"]["streak_event_type"]
          id?: string
          metadata?: Json
          next_status?:
            | Database["public"]["Enums"]["engagement_streak_status"]
            | null
          occurred_at?: string
          previous_status?:
            | Database["public"]["Enums"]["engagement_streak_status"]
            | null
          source_key: string
          token_delta?: number
          user_id: string
        }
        Update: {
          created_at?: string
          event_date?: string
          event_type?: Database["public"]["Enums"]["streak_event_type"]
          id?: string
          metadata?: Json
          next_status?:
            | Database["public"]["Enums"]["engagement_streak_status"]
            | null
          occurred_at?: string
          previous_status?:
            | Database["public"]["Enums"]["engagement_streak_status"]
            | null
          source_key?: string
          token_delta?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_streak_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
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
      admin_clear_ai_entity_translations: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: number
      }
      admin_delete_ai_content_translation: {
        Args: { p_translation_id: string }
        Returns: undefined
      }
      admin_delete_learning_document: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      admin_delete_study_group_message: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      admin_get_ai_monitoring_metrics: {
        Args: never
        Returns: {
          assistant_messages: number
          avg_latency_ms: number
          document_rag_messages: number
          document_rag_messages_without_sources: number
          embedded_document_chunks: number
          failed_documents: number
          general_ai_messages: number
          grounded_rule_messages: number
          max_latency_ms: number
          messages_with_sources: number
          no_rule_messages: number
          pending_documents: number
          processed_documents: number
          top_k_3_messages: number
          top_k_5_messages: number
          top_k_7_messages: number
          total_document_chunks: number
          total_rag_messages: number
          total_rag_sessions: number
          unsupported_documents: number
          user_messages: number
        }[]
      }
      admin_get_ai_translation_metrics: {
        Args: never
        Returns: {
          english_translations: number
          failed_translations: number
          total_translations: number
          unique_entities: number
          vietnamese_translations: number
        }[]
      }
      admin_get_cms_settings: {
        Args: never
        Returns: {
          created_at: string
          description: string
          key: string
          updated_at: string
          updated_by: string
          value: Json
        }[]
      }
      admin_get_document_chunks: {
        Args: { p_document_id: string; p_limit?: number }
        Returns: {
          chunk_id: string
          chunk_index: number
          content: string
          content_char_count: number
          created_at: string
          document_id: string
          embedding_model: string
          has_embedding: boolean
          status: string
          token_estimate: number
          updated_at: string
        }[]
      }
      admin_get_learning_document_detail: {
        Args: { p_document_id: string }
        Returns: {
          chunk_count: number
          created_at: string
          document_id: string
          embedded_chunk_count: number
          extracted_text_preview: string
          extracted_text_status: string
          failed_chunk_count: number
          file_name: string
          file_path: string
          file_size_bytes: number
          goal_id: string
          mime_type: string
          owner_email: string
          owner_id: string
          owner_name: string
          task_id: string
          updated_at: string
          visibility: string
        }[]
      }
      admin_get_rag_chat_messages: {
        Args: { p_limit?: number; p_session_id: string }
        Returns: {
          content: string
          context_mode: string
          created_at: string
          latency_ms: number
          message_id: string
          prompt_variant: string
          role: string
          selected_document_ids: string[]
          session_id: string
          source_count: number
          sources: Json
          top_k: number
          user_id: string
        }[]
      }
      admin_get_rag_chat_session_detail: {
        Args: { p_session_id: string }
        Returns: {
          context_mode: string
          created_at: string
          prompt_variant: string
          selected_document_count: number
          selected_document_ids: string[]
          session_id: string
          top_k: number
          updated_at: string
          user_email: string
          user_id: string
          user_name: string
        }[]
      }
      admin_get_rag_empty_source_answers: {
        Args: { p_limit?: number }
        Returns: {
          content: string
          context_mode: string
          created_at: string
          latency_ms: number
          message_id: string
          prompt_variant: string
          session_id: string
          top_k: number
          user_email: string
          user_id: string
          user_name: string
        }[]
      }
      admin_get_roadmap_metrics: {
        Args: never
        Returns: {
          applied_roadmaps: number
          archived_roadmaps: number
          draft_roadmaps: number
          total_goal_nodes: number
          total_roadmap_nodes: number
          total_roadmaps: number
          total_subtask_nodes: number
          total_task_nodes: number
        }[]
      }
      admin_get_study_group_detail: {
        Args: { p_group_id: string }
        Returns: {
          admin_note: string
          archived_at: string
          archived_by: string
          created_at: string
          description: string
          group_id: string
          is_private: boolean
          member_count: number
          message_count: number
          name: string
          owner_email: string
          owner_id: string
          owner_name: string
          updated_at: string
        }[]
      }
      admin_get_study_group_members: {
        Args: { p_group_id: string }
        Returns: {
          display_name: string
          email: string
          full_name: string
          group_id: string
          joined_at: string
          member_id: string
          membership_status: string
          role: string
          user_id: string
        }[]
      }
      admin_get_study_group_messages: {
        Args: { p_group_id: string; p_limit?: number }
        Returns: {
          content: string
          created_at: string
          display_name: string
          email: string
          full_name: string
          group_id: string
          message_id: string
          user_id: string
        }[]
      }
      admin_get_user_detail: {
        Args: { p_user_id: string }
        Returns: {
          completed_tasks: number
          created_at: string
          current_streak: number
          display_name: string
          email: string
          full_name: string
          last_sign_in_at: string
          leaderboard_opt_in: boolean
          processed_documents: number
          rag_chat_messages: number
          rag_chat_sessions: number
          role: string
          study_group_memberships: number
          token_balance: number
          total_focus_minutes: number
          total_focus_sessions: number
          total_goals: number
          total_tasks: number
          uploaded_documents: number
          user_id: string
        }[]
      }
      admin_search_ai_content_translations: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
          p_target_locale?: string
        }
        Returns: {
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string
          field_name: string
          model_name: string
          owner_email: string
          owner_id: string
          owner_name: string
          provider: string
          source_hash: string
          source_locale: string
          status: string
          target_locale: string
          translated_text: string
          translation_id: string
          updated_at: string
        }[]
      }
      admin_search_learning_documents: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
        }
        Returns: {
          chunk_count: number
          created_at: string
          document_id: string
          embedded_chunk_count: number
          extracted_text_preview: string
          extracted_text_status: string
          file_name: string
          file_path: string
          file_size_bytes: number
          goal_id: string
          mime_type: string
          owner_email: string
          owner_id: string
          owner_name: string
          task_id: string
          updated_at: string
          visibility: string
        }[]
      }
      admin_search_learning_roadmaps: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
        }
        Returns: {
          ai_latency_ms: number
          ai_model: string
          ai_provider: string
          applied_at: string
          archived_at: string
          created_at: string
          current_level: string
          description: string
          end_date: string
          goal_nodes: number
          minutes_per_study_day: number
          owner_email: string
          owner_name: string
          preferred_locale: string
          roadmap_id: string
          start_date: string
          status: string
          study_days_per_week: number
          subject_name: string
          subtask_nodes: number
          target_level: string
          task_nodes: number
          title: string
          topic: string
          total_nodes: number
          updated_at: string
          user_id: string
        }[]
      }
      admin_search_rag_chat_sessions: {
        Args: {
          p_context_mode?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: {
          assistant_message_count: number
          avg_latency_ms: number
          context_mode: string
          created_at: string
          message_count: number
          selected_document_count: number
          session_id: string
          top_k: number
          updated_at: string
          user_email: string
          user_id: string
          user_name: string
        }[]
      }
      admin_search_study_groups: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
        }
        Returns: {
          admin_note: string
          archived_at: string
          created_at: string
          description: string
          group_id: string
          is_private: boolean
          member_count: number
          message_count: number
          name: string
          owner_email: string
          owner_id: string
          owner_name: string
          updated_at: string
        }[]
      }
      admin_search_users: {
        Args: { p_limit?: number; p_offset?: number; p_query?: string }
        Returns: {
          completed_tasks: number
          created_at: string
          display_name: string
          email: string
          full_name: string
          last_sign_in_at: string
          leaderboard_opt_in: boolean
          role: string
          total_focus_minutes: number
          total_focus_sessions: number
          total_goals: number
          total_tasks: number
          uploaded_documents: number
          user_id: string
        }[]
      }
      admin_set_learning_roadmap_archived: {
        Args: { p_archived: boolean; p_roadmap_id: string }
        Returns: undefined
      }
      admin_set_study_group_archived: {
        Args: { p_admin_note?: string; p_archived: boolean; p_group_id: string }
        Returns: undefined
      }
      admin_update_cms_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      admin_update_user_leaderboard_visibility: {
        Args: { p_leaderboard_opt_in: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_update_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      apply_learning_roadmap: {
        Args: { p_roadmap_id: string }
        Returns: {
          created_goals: number
          created_subtasks: number
          created_tasks: number
          roadmap_id: string
        }[]
      }
      can_access_learning_document: {
        Args: { p_document_id: string; p_user_id: string }
        Returns: boolean
      }
      can_access_learning_document_storage_object: {
        Args: { p_object_name: string; p_user_id: string }
        Returns: boolean
      }
      can_access_study_group_realtime_topic: {
        Args: { p_topic: string; p_user_id: string }
        Returns: boolean
      }
      can_access_study_room_presence_topic: {
        Args: { p_topic: string; p_user_id?: string }
        Returns: boolean
      }
      can_access_study_room_realtime_topic: {
        Args: { p_topic: string; p_user_id?: string }
        Returns: boolean
      }
      can_manage_study_group_members: {
        Args: { p_room_id: string; p_user_id: string }
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
      expire_frozen_streaks: { Args: never; Returns: number }
      extract_learning_document_id_from_storage_path: {
        Args: { p_object_name: string }
        Returns: string
      }
      find_user_id_by_auth_email: { Args: { p_email: string }; Returns: string }
      get_admin_dashboard_metrics: {
        Args: never
        Returns: {
          completed_tasks: number
          failed_learning_documents: number
          processed_learning_documents: number
          total_admins: number
          total_document_chunks: number
          total_focus_minutes: number
          total_focus_sessions: number
          total_goals: number
          total_group_messages: number
          total_learning_documents: number
          total_rag_chat_messages: number
          total_rag_chat_sessions: number
          total_study_groups: number
          total_tasks: number
          total_users: number
          users_created_last_7_days: number
        }[]
      }
      get_admin_recent_users: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          display_name: string
          full_name: string
          last_sign_in_at: string
          leaderboard_opt_in: boolean
          role: string
          user_id: string
        }[]
      }
      get_cms_setting: { Args: { p_key: string }; Returns: Json }
      get_global_weekly_leaderboard: {
        Args: { p_limit?: number; p_week_end: string; p_week_start: string }
        Returns: {
          avatar_url: string
          completed_tasks: number
          current_streak: number
          display_name: string
          focus_minutes: number
          focus_sessions: number
          rank_position: number
          score: number
          user_id: string
        }[]
      }
      get_my_global_weekly_rank: {
        Args: { p_week_end: string; p_week_start: string }
        Returns: {
          completed_tasks: number
          current_streak: number
          display_name: string
          focus_minutes: number
          focus_sessions: number
          rank_position: number
          score: number
          user_id: string
        }[]
      }
      get_study_group_members_with_email: {
        Args: { p_group_id: string }
        Returns: {
          email: string
          joined_at: string
          member_id: string
          membership_status: string
          role: string
          room_id: string
          user_id: string
        }[]
      }
      get_study_group_messages_with_email: {
        Args: { p_group_id: string; p_limit?: number }
        Returns: {
          content: string
          created_at: string
          email: string
          message_id: string
          room_id: string
          user_id: string
        }[]
      }
      get_study_group_weekly_challenge_progress: {
        Args: { p_group_id: string; p_week_end: string; p_week_start: string }
        Returns: {
          actual_completed_tasks: number
          actual_focus_minutes: number
          focus_progress_percent: number
          group_id: string
          target_completed_tasks: number
          target_focus_minutes: number
          task_progress_percent: number
          week_end: string
          week_start: string
        }[]
      }
      get_study_group_weekly_leaderboard: {
        Args: { p_group_id: string; p_week_end: string; p_week_start: string }
        Returns: {
          completed_tasks: number
          email: string
          focus_minutes: number
          rank_position: number
          role: string
          score: number
          user_id: string
        }[]
      }
      get_user_token_balance: { Args: { p_user_id: string }; Returns: number }
      is_active_study_group_member: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
      is_active_study_room_member: {
        Args: { p_room_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_study_group_owner: {
        Args: { p_room_id: string; p_user_id: string }
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
      match_learning_document_chunks: {
        Args: {
          p_document_ids?: string[]
          p_match_count?: number
          p_query_embedding: string
          p_user_id?: string
        }
        Returns: {
          chunk_id: string
          chunk_index: number
          content: string
          document_id: string
          file_name: string
          similarity: number
        }[]
      }
      restore_my_streak_with_tokens: { Args: never; Returns: Json }
    }
    Enums: {
      ai_insight_type: "deadline_risk" | "native_task_risk"
      ai_translation_status: "completed" | "failed"
      app_role: "user" | "admin"
      deadline_risk_input_mode:
        | "oulad_compatible_features"
        | "lumivox_native_features"
      distraction_type:
        | "social_media"
        | "messaging"
        | "external_interrupt"
        | "fatigue"
        | "other"
      document_chunk_status: "pending" | "embedded" | "failed"
      engagement_streak_status: "active" | "frozen" | "lost"
      feature_attribution_effect:
        | "increases_risk"
        | "decreases_risk"
        | "neutral"
      focus_session_status: "ongoing" | "paused" | "completed" | "cancelled"
      goal_status: "active" | "completed" | "paused" | "archived"
      goal_type: "short_term" | "long_term"
      learning_document_permission_role: "viewer" | "editor"
      learning_document_visibility: "private" | "shared" | "public"
      learning_roadmap_level:
        | "beginner"
        | "intermediate"
        | "advanced"
        | "custom"
      learning_roadmap_node_type: "goal" | "task" | "subtask"
      learning_roadmap_status: "draft" | "applied" | "archived"
      native_task_risk_band: "low" | "moderate" | "elevated" | "high"
      rag_context_mode: "general" | "document_rag"
      rag_message_role: "user" | "assistant" | "system"
      rag_prompt_variant: "no_rule" | "grounded_rule"
      reward_event_type:
        | "focus_session_completed"
        | "task_completed"
        | "daily_streak_continued"
        | "streak_milestone_3"
        | "streak_milestone_7"
        | "streak_restored_with_tokens"
      streak_event_type:
        | "activity_detected"
        | "streak_started"
        | "streak_continued"
        | "streak_frozen"
        | "streak_restored"
        | "streak_lost"
      study_room_member_role: "owner" | "member"
      study_room_member_status: "active" | "left" | "removed"
      study_room_status: "active" | "archived"
      study_room_type: "room" | "group"
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
      ai_translation_status: ["completed", "failed"],
      app_role: ["user", "admin"],
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
      document_chunk_status: ["pending", "embedded", "failed"],
      engagement_streak_status: ["active", "frozen", "lost"],
      feature_attribution_effect: [
        "increases_risk",
        "decreases_risk",
        "neutral",
      ],
      focus_session_status: ["ongoing", "paused", "completed", "cancelled"],
      goal_status: ["active", "completed", "paused", "archived"],
      goal_type: ["short_term", "long_term"],
      learning_document_permission_role: ["viewer", "editor"],
      learning_document_visibility: ["private", "shared", "public"],
      learning_roadmap_level: [
        "beginner",
        "intermediate",
        "advanced",
        "custom",
      ],
      learning_roadmap_node_type: ["goal", "task", "subtask"],
      learning_roadmap_status: ["draft", "applied", "archived"],
      native_task_risk_band: ["low", "moderate", "elevated", "high"],
      rag_context_mode: ["general", "document_rag"],
      rag_message_role: ["user", "assistant", "system"],
      rag_prompt_variant: ["no_rule", "grounded_rule"],
      reward_event_type: [
        "focus_session_completed",
        "task_completed",
        "daily_streak_continued",
        "streak_milestone_3",
        "streak_milestone_7",
        "streak_restored_with_tokens",
      ],
      streak_event_type: [
        "activity_detected",
        "streak_started",
        "streak_continued",
        "streak_frozen",
        "streak_restored",
        "streak_lost",
      ],
      study_room_member_role: ["owner", "member"],
      study_room_member_status: ["active", "left", "removed"],
      study_room_status: ["active", "archived"],
      study_room_type: ["room", "group"],
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
