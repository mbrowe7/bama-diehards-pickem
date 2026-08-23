// Hand-written to match supabase/migrations/*.sql. Keep in sync manually --
// there's no live `supabase gen types` pipeline wired up for this project.
//
// `Relationships: []` on every table/view is required by supabase-js's
// GenericTable/GenericView constraint even though we don't use PostgREST's
// typed embedded-resource inference (embedded selects are cast manually).

export type PlayerRole = 'player' | 'admin';
export type GameResult = 'favorite_covered' | 'underdog_covered' | 'push';
export type PickOutcome = 'win' | 'loss' | 'push';
export type ProjectionCategory =
  | 'acc_champ' | 'big10_champ' | 'big12_champ' | 'sec_champ' | 'g5_rep'
  | 'at_large' | 'heisman_finalist' | 'heisman_winner' | 'national_champion';
export type ScoringRuleKey =
  | 'correct_pick' | 'correct_bonus' | 'correct_conf_champ' | 'correct_at_large'
  | 'correct_heisman_finalist' | 'correct_heisman_winner' | 'correct_national_champ';

export interface Database {
  public: {
    Tables: {
      players: {
        Row: { id: string; display_name: string; role: PlayerRole; created_at: string };
        Insert: { id: string; display_name: string; role?: PlayerRole };
        Update: Partial<{ display_name: string; role: PlayerRole }>;
        Relationships: [];
      };
      teams: {
        Row: { id: string; name: string };
        Insert: { id?: string; name: string };
        Update: Partial<{ name: string }>;
        Relationships: [];
      };
      seasons: {
        Row: { id: string; year: number; pushes_are_ties: boolean };
        Insert: { id?: string; year: number; pushes_are_ties?: boolean };
        Update: Partial<{ year: number; pushes_are_ties: boolean }>;
        Relationships: [];
      };
      weeks: {
        Row: { id: string; season_id: string; label: string; sort_order: number };
        Insert: { id?: string; season_id: string; label: string; sort_order: number };
        Update: Partial<{ label: string; sort_order: number }>;
        Relationships: [];
      };
      games: {
        Row: {
          id: string; week_id: string; favorite_team_id: string; underdog_team_id: string;
          spread: number; neutral_site: string | null; kickoff_at: string;
          favorite_score: number | null; underdog_score: number | null; result: GameResult | null;
        };
        Insert: {
          id?: string; week_id: string; favorite_team_id: string; underdog_team_id: string;
          spread: number; neutral_site?: string | null; kickoff_at: string;
          favorite_score?: number | null; underdog_score?: number | null;
        };
        Update: Partial<{
          favorite_team_id: string; underdog_team_id: string; spread: number;
          neutral_site: string | null; kickoff_at: string;
          favorite_score: number | null; underdog_score: number | null;
        }>;
        Relationships: [];
      };
      picks: {
        Row: {
          id: string; game_id: string; player_id: string; team_id: string;
          submitted_at: string; submitted_by: string; outcome: PickOutcome | null;
        };
        Insert: {
          id?: string; game_id: string; player_id: string; team_id: string; submitted_by: string;
        };
        Update: Partial<{ team_id: string; submitted_by: string }>;
        Relationships: [];
      };
      bonus_picks: {
        Row: {
          id: string; week_id: string; player_id: string; description: string;
          submitted_at: string; submitted_by: string; is_correct: boolean | null;
        };
        Insert: {
          id?: string; week_id: string; player_id: string; description: string; submitted_by: string;
        };
        Update: Partial<{ description: string; is_correct: boolean | null }>;
        Relationships: [];
      };
      scoring_rules: {
        Row: { id: string; season_id: string; rule_key: ScoringRuleKey; points: number };
        Insert: { id?: string; season_id: string; rule_key: ScoringRuleKey; points: number };
        Update: Partial<{ points: number }>;
        Relationships: [];
      };
      preseason_projections: {
        Row: {
          id: string; season_id: string; player_id: string; category: ProjectionCategory;
          slot: number; team_id: string | null; player_name: string | null; locked_at: string;
        };
        Insert: {
          id?: string; season_id: string; player_id: string; category: ProjectionCategory;
          slot?: number; team_id?: string | null; player_name?: string | null; locked_at: string;
        };
        Update: Partial<{ team_id: string | null; player_name: string | null }>;
        Relationships: [];
      };
      season_outcomes: {
        Row: {
          id: string; season_id: string; category: ProjectionCategory;
          slot: number; team_id: string | null; player_name: string | null;
        };
        Insert: {
          id?: string; season_id: string; category: ProjectionCategory;
          slot?: number; team_id?: string | null; player_name?: string | null;
        };
        Update: Partial<{ team_id: string | null; player_name: string | null }>;
        Relationships: [];
      };
    };
    Views: {
      standings: {
        Row: {
          season_id: string; season_year: number; player_id: string; display_name: string;
          total_points: number; pick_points: number; bonus_points: number; preseason_points: number;
          wins: number; losses: number; ties: number;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
