import type { ThreadGoalSnapshot } from "@t3tools/contracts";
import { formatTokens } from "@t3tools/shared/usageFormat";
import {
  IconCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconTargetArrow,
  IconTrash,
  IconX,
} from "@tabler/icons-react-native";
import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, View, type TextInput } from "react-native";

import { AppText as Text, AppTextInput } from "../../components/AppText";
import { SymbolView, type AppSymbolName } from "../../components/AppSymbol";
import { useThemeColor } from "../../lib/useThemeColor";
import {
  formatThreadGoalTime,
  reduceGoalObjectiveEditor,
  threadGoalStatusLabel,
  type ThreadGoalAction,
  type ThreadLivePlanStatus,
} from "./ThreadLiveStatusStrip.logic";

export type { ThreadGoalAction, ThreadLivePlanStatus } from "./ThreadLiveStatusStrip.logic";
export { estimateThreadLiveStatusHeight } from "./ThreadLiveStatusStrip.logic";

export interface ThreadLiveStatusStripProps {
  readonly plan: ThreadLivePlanStatus | null;
  readonly goal: ThreadGoalSnapshot | null;
  readonly pendingGoalAction: ThreadGoalAction | null;
  readonly disabled?: boolean;
  readonly onSetGoal: (objective: string) => Promise<boolean>;
  readonly onPauseGoal: () => Promise<boolean>;
  readonly onResumeGoal: () => Promise<boolean>;
  readonly onClearGoal: () => Promise<boolean>;
}

function GoalIconButton(props: {
  readonly accessibilityLabel: string;
  readonly name: AppSymbolName;
  readonly fallback: ReactNode;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  const iconColor = useThemeColor("--color-icon-muted");
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      className="h-8 w-8 items-center justify-center rounded-full active:bg-subtle-strong disabled:opacity-35"
      disabled={props.disabled}
      hitSlop={4}
      onPress={props.onPress}
    >
      <SymbolView
        name={props.name}
        fallback={props.fallback}
        size={14}
        tintColor={iconColor}
        type="monochrome"
      />
    </Pressable>
  );
}

export function ThreadLiveStatusStrip(props: ThreadLiveStatusStripProps) {
  const iconColor = useThemeColor("--color-icon-muted");
  const inputRef = useRef<TextInput>(null);
  const goalObjectiveRef = useRef(props.goal?.objective ?? null);
  goalObjectiveRef.current = props.goal?.objective ?? null;
  const [editor, dispatchEditor] = useReducer(reduceGoalObjectiveEditor, {
    editing: false,
    draftObjective: props.goal?.objective ?? "",
    submittedObjective: null,
  });
  const goalPending = props.disabled === true || props.pendingGoalAction !== null;

  useEffect(() => {
    dispatchEditor({ type: "sync", objective: props.goal?.objective ?? null });
  }, [editor.submittedObjective, props.goal?.objective]);

  useEffect(() => {
    if (!editor.editing) return;
    inputRef.current?.focus();
  }, [editor.editing]);

  if (!props.plan && !props.goal) return null;

  const completedSteps = props.plan
    ? Math.max(0, Math.min(props.plan.completedSteps, props.plan.totalSteps))
    : 0;
  const progress =
    props.plan && props.plan.totalSteps > 0 ? completedSteps / props.plan.totalSteps : 0;
  const canResume =
    props.goal?.status === "paused" ||
    props.goal?.status === "blocked" ||
    props.goal?.status === "budgetLimited" ||
    props.goal?.status === "usageLimited";

  const saveObjective = async () => {
    const objective = editor.draftObjective.trim();
    if (!props.goal || !objective || goalPending) return;
    if (objective === props.goal.objective) {
      dispatchEditor({ type: "cancel", objective: props.goal.objective });
      return;
    }

    const accepted = await props.onSetGoal(objective).catch(() => false);
    if (accepted) {
      dispatchEditor({
        type: "submitAccepted",
        objective,
        snapshotObjective: goalObjectiveRef.current,
      });
    }
  };

  const confirmClearGoal = () => {
    if (goalPending) return;
    Alert.alert("Clear goal?", "This removes the goal from this thread.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear goal",
        style: "destructive",
        onPress: () => {
          void props.onClearGoal();
        },
      },
    ]);
  };

  return (
    <View
      accessibilityLabel="Live thread status"
      className="mx-4 mb-2 overflow-hidden rounded-lg border border-border bg-card"
    >
      {props.plan ? (
        <View
          className={`min-h-10 flex-row items-center gap-2 px-3 ${props.goal ? "border-b border-border-subtle" : ""}`}
        >
          <SymbolView name="checkmark.circle" size={14} tintColor={iconColor} type="monochrome" />
          <Text className="text-2xs text-foreground-muted">Current</Text>
          <Text className="min-w-0 flex-1 font-t3-bold text-xs" numberOfLines={1}>
            {props.plan.currentStep}
          </Text>
          <View className="h-1 w-9 overflow-hidden rounded-full bg-subtle-strong">
            <View
              className="h-1 rounded-full bg-foreground-muted"
              style={{ width: `${progress * 100}%` }}
            />
          </View>
          <Text className="font-mono text-2xs text-foreground-muted">
            {completedSteps}/{props.plan.totalSteps}
          </Text>
        </View>
      ) : null}

      {props.goal ? (
        <View className="min-h-14 flex-row items-center gap-2 px-3 py-1">
          <SymbolView
            name="scope"
            fallback={<IconTargetArrow color={iconColor} size={14} strokeWidth={2} />}
            size={14}
            tintColor={iconColor}
            type="monochrome"
          />

          {editor.editing ? (
            <View className="min-w-0 flex-1 flex-row items-center gap-1">
              <AppTextInput
                ref={inputRef}
                accessibilityLabel="Goal objective"
                className="min-h-9 flex-1 rounded-md px-2 py-1 text-sm"
                editable={!goalPending}
                enterKeyHint="done"
                onChangeText={(objective) => dispatchEditor({ type: "change", objective })}
                onSubmitEditing={() => void saveObjective()}
                returnKeyType="done"
                selectTextOnFocus
                value={editor.draftObjective}
              />
              {props.pendingGoalAction !== null ? (
                <View className="h-8 w-8 items-center justify-center">
                  <ActivityIndicator
                    accessibilityLabel="Updating goal"
                    color={iconColor}
                    size="small"
                  />
                </View>
              ) : (
                <GoalIconButton
                  accessibilityLabel="Save goal objective"
                  disabled={!editor.draftObjective.trim() || goalPending}
                  fallback={<IconCheck color={iconColor} size={14} strokeWidth={2} />}
                  name="checkmark"
                  onPress={() => void saveObjective()}
                />
              )}
              <GoalIconButton
                accessibilityLabel="Cancel goal edit"
                fallback={<IconX color={iconColor} size={14} strokeWidth={2} />}
                name="xmark"
                onPress={() =>
                  dispatchEditor({ type: "cancel", objective: props.goal?.objective ?? "" })
                }
              />
            </View>
          ) : (
            <View className="min-w-0 flex-1">
              <Text className="font-t3-bold text-xs" numberOfLines={1}>
                {props.goal.objective}
              </Text>
              <Text className="text-2xs text-foreground-muted" numberOfLines={1}>
                {threadGoalStatusLabel(props.goal.status)} · {formatTokens(props.goal.tokensUsed)}
                {props.goal.tokenBudget == null
                  ? ""
                  : `/${formatTokens(props.goal.tokenBudget)}`}{" "}
                tokens · {formatThreadGoalTime(props.goal.timeUsedSeconds)}
              </Text>
            </View>
          )}

          {!editor.editing ? (
            <View className="flex-row items-center">
              {props.pendingGoalAction !== null ? (
                <View className="h-8 w-8 items-center justify-center">
                  <ActivityIndicator
                    accessibilityLabel="Updating goal"
                    color={iconColor}
                    size="small"
                  />
                </View>
              ) : (
                <>
                  <GoalIconButton
                    accessibilityLabel="Edit goal"
                    disabled={goalPending}
                    fallback={<IconTargetArrow color={iconColor} size={14} strokeWidth={2} />}
                    name="square.and.pencil"
                    onPress={() =>
                      dispatchEditor({ type: "begin", objective: props.goal?.objective ?? "" })
                    }
                  />
                  {props.goal.status === "active" ? (
                    <GoalIconButton
                      accessibilityLabel="Pause goal"
                      disabled={goalPending}
                      fallback={<IconPlayerPause color={iconColor} size={14} strokeWidth={2} />}
                      name="pause.fill"
                      onPress={() => void props.onPauseGoal()}
                    />
                  ) : canResume ? (
                    <GoalIconButton
                      accessibilityLabel="Resume goal"
                      disabled={goalPending}
                      fallback={<IconPlayerPlay color={iconColor} size={14} strokeWidth={2} />}
                      name="play.fill"
                      onPress={() => void props.onResumeGoal()}
                    />
                  ) : null}
                  <GoalIconButton
                    accessibilityLabel="Clear goal"
                    disabled={goalPending}
                    fallback={<IconTrash color={iconColor} size={14} strokeWidth={2} />}
                    name="trash"
                    onPress={confirmClearGoal}
                  />
                </>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
