-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('OPENAI', 'ANTHROPIC', 'GITHUB', 'QODER');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('API_KEY', 'OAUTH', 'CLI_PAT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('CONNECTED', 'ERROR', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "UsageSource" AS ENUM ('PROVIDER_API', 'RATE_LIMIT_HEADERS', 'ESTIMATED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "RoutingMode" AS ENUM ('MANUAL', 'AUTOMATIC', 'INTELLIGENT');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SwitchReason" AS ENUM ('QUOTA_EXHAUSTED', 'RATE_LIMITED', 'AUTH_ERROR', 'PROVIDER_ERROR', 'MANUAL', 'ROUTING');

-- CreateEnum
CREATE TYPE "ToolExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DENIED');

-- CreateEnum
CREATE TYPE "FileChangeType" AS ENUM ('CREATE', 'MODIFY', 'DELETE', 'RENAME');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContextTrigger" AS ENUM ('USER_MESSAGE', 'PROVIDER_SWITCH', 'TOOL_EXECUTION', 'FILE_CHANGE', 'TASK_UPDATE', 'MANUAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProviderKind" NOT NULL,
    "auth_methods" "AuthMethod"[],
    "docs_url" TEXT,
    "capabilities" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'default',
    "auth_method" "AuthMethod" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "status_message" TEXT,
    "credential_ciphertext" TEXT NOT NULL,
    "credential_key_version" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "last_validated_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_models" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "context_window" INTEGER,
    "max_output_tokens" INTEGER,
    "supports_streaming" BOOLEAN NOT NULL DEFAULT true,
    "supports_tools" BOOLEAN NOT NULL DEFAULT false,
    "supports_vision" BOOLEAN NOT NULL DEFAULT false,
    "input_cost_per_mtok" DECIMAL(12,4),
    "output_cost_per_mtok" DECIMAL(12,4),
    "available" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage" (
    "id" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3),
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost_usd" DECIMAL(14,6),
    "quota_remaining" DOUBLE PRECISION,
    "quota_limit" DOUBLE PRECISION,
    "reset_at" TIMESTAMP(3),
    "rate_limit_state" JSONB,
    "source" "UsageSource" NOT NULL DEFAULT 'UNAVAILABLE',
    "last_request_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "model_id" TEXT,
    "status" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost_usd" DECIMAL(14,6),
    "latency_ms" INTEGER,
    "source" "UsageSource" NOT NULL DEFAULT 'UNAVAILABLE',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "root_path" TEXT,
    "git_remote_url" TEXT,
    "default_branch" TEXT DEFAULT 'main',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "remote_url" TEXT,
    "branch" TEXT,
    "index_status" TEXT NOT NULL DEFAULT 'pending',
    "last_indexed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "routing_mode" "RoutingMode" NOT NULL DEFAULT 'MANUAL',
    "active_account_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "provider_account_id" TEXT,
    "model_id" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_events" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_memories" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_snapshots" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "trigger" "ContextTrigger" NOT NULL,
    "token_count" INTEGER,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_switches" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "from_account_id" TEXT,
    "to_account_id" TEXT,
    "reason" "SwitchReason" NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_switches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_executions" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT,
    "provider_account_id" TEXT,
    "tool_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "ToolExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_change_logs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "tool_execution_id" TEXT,
    "path" TEXT NOT NULL,
    "change_type" "FileChangeType" NOT NULL,
    "before_hash" TEXT,
    "after_hash" TEXT,
    "diff" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_states" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" "RoutingMode" NOT NULL DEFAULT 'AUTOMATIC',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditions" JSONB NOT NULL,
    "target_provider_kind" "ProviderKind",
    "target_model_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_model_id" TEXT NOT NULL,
    "task_type" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "providers_key_key" ON "providers"("key");

-- CreateIndex
CREATE INDEX "provider_accounts_user_id_enabled_priority_idx" ON "provider_accounts"("user_id", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "provider_accounts_user_id_provider_id_label_key" ON "provider_accounts"("user_id", "provider_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "provider_models_provider_id_model_id_key" ON "provider_models"("provider_id", "model_id");

-- CreateIndex
CREATE INDEX "provider_usage_provider_account_id_last_request_at_idx" ON "provider_usage"("provider_account_id", "last_request_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_usage_provider_account_id_period_start_key" ON "provider_usage"("provider_account_id", "period_start");

-- CreateIndex
CREATE INDEX "usage_events_provider_account_id_occurred_at_idx" ON "usage_events"("provider_account_id", "occurred_at");

-- CreateIndex
CREATE INDEX "usage_events_conversation_id_occurred_at_idx" ON "usage_events"("conversation_id", "occurred_at");

-- CreateIndex
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_project_id_path_key" ON "repositories"("project_id", "path");

-- CreateIndex
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "conversations_project_id_idx" ON "conversations"("project_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_sequence_key" ON "messages"("conversation_id", "sequence");

-- CreateIndex
CREATE INDEX "conversation_events_conversation_id_created_at_idx" ON "conversation_events"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_memories_project_id_key_key" ON "project_memories"("project_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "context_snapshots_conversation_id_version_key" ON "context_snapshots"("conversation_id", "version");

-- CreateIndex
CREATE INDEX "provider_switches_conversation_id_created_at_idx" ON "provider_switches"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tool_executions_idempotency_key_key" ON "tool_executions"("idempotency_key");

-- CreateIndex
CREATE INDEX "tool_executions_conversation_id_started_at_idx" ON "tool_executions"("conversation_id", "started_at");

-- CreateIndex
CREATE INDEX "file_change_logs_project_id_created_at_idx" ON "file_change_logs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "file_change_logs_conversation_id_idx" ON "file_change_logs"("conversation_id");

-- CreateIndex
CREATE INDEX "task_states_project_id_status_idx" ON "task_states"("project_id", "status");

-- CreateIndex
CREATE INDEX "routing_rules_user_id_enabled_priority_idx" ON "routing_rules"("user_id", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "model_preferences_user_id_provider_model_id_task_type_key" ON "model_preferences"("user_id", "provider_model_id", "task_type");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "provider_accounts" ADD CONSTRAINT "provider_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_accounts" ADD CONSTRAINT "provider_accounts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_models" ADD CONSTRAINT "provider_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_provider_account_id_fkey" FOREIGN KEY ("provider_account_id") REFERENCES "provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_provider_account_id_fkey" FOREIGN KEY ("provider_account_id") REFERENCES "provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_provider_account_id_fkey" FOREIGN KEY ("provider_account_id") REFERENCES "provider_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memories" ADD CONSTRAINT "project_memories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_switches" ADD CONSTRAINT "provider_switches_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_switches" ADD CONSTRAINT "provider_switches_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "provider_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_switches" ADD CONSTRAINT "provider_switches_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "provider_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_provider_account_id_fkey" FOREIGN KEY ("provider_account_id") REFERENCES "provider_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_change_logs" ADD CONSTRAINT "file_change_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_change_logs" ADD CONSTRAINT "file_change_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_change_logs" ADD CONSTRAINT "file_change_logs_tool_execution_id_fkey" FOREIGN KEY ("tool_execution_id") REFERENCES "tool_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_states" ADD CONSTRAINT "task_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_states" ADD CONSTRAINT "task_states_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_preferences" ADD CONSTRAINT "model_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_preferences" ADD CONSTRAINT "model_preferences_provider_model_id_fkey" FOREIGN KEY ("provider_model_id") REFERENCES "provider_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
