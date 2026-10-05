import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Radio,
  RadioGroup,
  Select,
  SimpleGrid,
  Spacer,
  Tag,
  Text,
  VStack,
  useToast
} from '@chakra-ui/react';
import { GitMerge, Plus, Save, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { collabOwnerLabels } from '../state/collab';
import type { CollabOwner, CollabState, FixtureChange, LightingPlan } from '../types';

interface CollabPanelProps {
  plan: LightingPlan;
  collab: CollabState;
  onEdit: (owner: CollabOwner, cueId: string, change: FixtureChange) => void;
  onRemove: (owner: CollabOwner, cueId: string) => void;
  onSave: (owner: CollabOwner) => void;
  onResolve: (resolutions: Record<string, CollabOwner>) => void;
  onDiscard: () => void;
  onReset: () => void;
}

interface FixtureOption {
  cueId: string;
  label: string;
  sceneName: string;
}

function fixtureOptions(plan: LightingPlan): FixtureOption[] {
  const options: FixtureOption[] = [];
  for (const scene of plan.scenes) {
    for (const cue of scene.cues) {
      options.push({ cueId: cue.id, label: `${cue.number} · ${cue.label}`, sceneName: scene.name });
    }
  }
  return options;
}

function fixtureLabel(plan: LightingPlan, cueId: string): string {
  for (const scene of plan.scenes) {
    const cue = scene.cues.find((c) => c.id === cueId);
    if (cue) return `${cue.number} · ${cue.label}`;
  }
  return cueId;
}

function circuitName(plan: LightingPlan, circuitId: string | undefined): string {
  if (!circuitId) return '未分配';
  return plan.circuits.find((c) => c.id === circuitId)?.name ?? circuitId;
}

function ChangeSummary({ plan, change }: { plan: LightingPlan; change: FixtureChange }) {
  return (
    <HStack spacing={2} fontSize="xs" flexWrap="wrap">
      <Tag size="sm" colorScheme="purple">{circuitName(plan, change.circuitId)}</Tag>
      {change.wattage !== undefined ? <Tag size="sm" colorScheme="blue">{change.wattage}W</Tag> : null}
    </HStack>
  );
}

function EditorDraft({
  owner,
  plan,
  collab,
  onEdit,
  onRemove,
  onSave
}: {
  owner: CollabOwner;
  plan: LightingPlan;
  collab: CollabState;
  onEdit: (owner: CollabOwner, cueId: string, change: FixtureChange) => void;
  onRemove: (owner: CollabOwner, cueId: string) => void;
  onSave: (owner: CollabOwner) => void;
}) {
  const toast = useToast();
  const options = useMemo(() => fixtureOptions(plan), [plan]);
  const [cueId, setCueId] = useState('');
  const [circuitId, setCircuitId] = useState('');
  const [wattage, setWattage] = useState<number>(0);
  const draft = collab.drafts[owner];
  const accent = owner === 'designer' ? 'amber' : 'cyan';

  function add() {
    if (!cueId) {
      toast({ title: '请先选择要调整的灯具', status: 'warning' });
      return;
    }
    onEdit(owner, cueId, {
      circuitId: circuitId || undefined,
      wattage: wattage > 0 ? wattage : undefined
    });
    setCueId('');
    setCircuitId('');
    setWattage(0);
  }

  return (
    <Box p={3} borderRadius="lg" borderWidth="1px" borderColor="whiteAlpha.100" bg="blackAlpha.200">
      <Flex align="center" mb={2}>
        <HStack spacing={2}>
          <Users size={14} color={owner === 'designer' ? '#f6c453' : '#76e4f7'} />
          <Text fontWeight="650" fontSize="sm">{collabOwnerLabels[owner]}</Text>
        </HStack>
        <Spacer />
        {draft.saved ? <Tag size="sm" colorScheme="green">已保存</Tag> : <Tag size="sm" colorScheme="orange">草稿</Tag>}
      </Flex>

      {!collab.archived ? (
        <VStack align="stretch" spacing={2}>
          <FormControl>
            <FormLabel fontSize="xs">调整灯具</FormLabel>
            <Select size="sm" value={cueId} onChange={(e) => setCueId(e.target.value)}>
              <option value="">选择灯具…</option>
              {options.map((opt) => (
                <option key={opt.cueId} value={opt.cueId}>{opt.sceneName} · {opt.label}</option>
              ))}
            </Select>
          </FormControl>
          <HStack spacing={2}>
            <FormControl>
              <FormLabel fontSize="xs">改到回路</FormLabel>
              <Select size="sm" value={circuitId} onChange={(e) => setCircuitId(e.target.value)}>
                <option value="">不修改</option>
                {plan.circuits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormControl>
            <FormControl w="110px">
              <FormLabel fontSize="xs">功率 W</FormLabel>
              <NumberInput size="sm" value={wattage} min={0} max={20000} step={100} onChange={(_, v) => setWattage(Number(v) || 0)}>
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            </FormControl>
          </HStack>
          <Button size="xs" variant="outline" leftIcon={<Plus size={12} />} onClick={add}>加入草稿</Button>
        </VStack>
      ) : null}

      <Divider my={2} />

      <VStack align="stretch" spacing={1}>
        {Object.keys(draft.changes).length ? (
          Object.entries(draft.changes).map(([id, change]) => (
            <Flex key={id} align="center" gap={2} fontSize="xs">
              <Text flex="1" noOfLines={1}>{fixtureLabel(plan, id)}</Text>
              <ChangeSummary plan={plan} change={change} />
              {!collab.archived ? (
                <IconButton aria-label="移除" size="xs" variant="ghost" icon={<Trash2 size={11} />} onClick={() => onRemove(owner, id)} />
              ) : null}
            </Flex>
          ))
        ) : (
          <Text fontSize="xs" color="whiteAlpha.400">暂无草稿修改</Text>
        )}
      </VStack>

      {!collab.archived ? (
        <Button
          mt={2}
          w="full"
          size="sm"
          colorScheme={accent}
          leftIcon={<Save size={13} />}
          isDisabled={!Object.keys(draft.changes).length}
          onClick={() => onSave(owner)}
        >
          保存{collabOwnerLabels[owner]}草稿
        </Button>
      ) : null}
    </Box>
  );
}

function MergeDialog({
  plan,
  collab,
  onResolve,
  onDiscard
}: {
  plan: LightingPlan;
  collab: CollabState;
  onResolve: (resolutions: Record<string, CollabOwner>) => void;
  onDiscard: () => void;
}) {
  const conflicts = collab.pending ?? [];
  const [choices, setChoices] = useState<Record<string, CollabOwner>>({});

  function choose(cueId: string, owner: CollabOwner) {
    setChoices((prev) => ({ ...prev, [cueId]: owner }));
  }

  function confirm() {
    const resolutions: Record<string, CollabOwner> = {};
    for (const conflict of conflicts) {
      resolutions[conflict.cueId] = choices[conflict.cueId] ?? 'designer';
    }
    onResolve(resolutions);
  }

  return (
    <Modal isOpen onClose={onDiscard} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack><GitMerge size={18} /><Text>待确认差异 · 双方草稿均保留</Text></HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Alert status="warning" borderRadius="lg" mb={3}>
            <AlertIcon />
            <AlertDescription fontSize="sm">
              灯光设计与编程执行修改了同一灯具的回路。后保存的一方不会覆盖对方，请逐灯具确认采用哪一版；确认后双方草稿仍保留为历史记录。
            </AlertDescription>
          </Alert>
          <VStack align="stretch" spacing={3}>
            {conflicts.map((conflict) => (
              <Box key={conflict.cueId} p={3} borderRadius="lg" borderWidth="1px" borderColor="whiteAlpha.100" bg="blackAlpha.200">
                <Text fontWeight="650" fontSize="sm" mb={2}>{fixtureLabel(plan, conflict.cueId)}</Text>
                <RadioGroup value={choices[conflict.cueId] ?? ''} onChange={(v) => choose(conflict.cueId, v as CollabOwner)}>
                  <VStack align="stretch" spacing={2}>
                    {(['designer', 'programmer'] as CollabOwner[]).map((owner) => {
                      const change = owner === 'designer' ? conflict.designer : conflict.programmer;
                      return (
                        <Box
                          key={owner}
                          as="label"
                          p={2}
                          borderRadius="md"
                          borderWidth="1px"
                          borderColor={choices[conflict.cueId] === owner ? (owner === 'designer' ? 'amber.400' : 'cyan.400') : 'whiteAlpha.100'}
                          cursor="pointer"
                        >
                          <HStack>
                            <Radio value={owner} colorScheme={owner === 'designer' ? 'amber' : 'cyan'} />
                            <Text fontSize="sm" fontWeight="650">{collabOwnerLabels[owner]}</Text>
                            <Spacer />
                            <ChangeSummary plan={plan} change={change} />
                          </HStack>
                        </Box>
                      );
                    })}
                  </VStack>
                </RadioGroup>
              </Box>
            ))}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={2} onClick={onDiscard}>取消</Button>
          <Button colorScheme="amber" leftIcon={<GitMerge size={15} />} onClick={confirm}>确认差异并保留双方草稿</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default function CollabPanel({
  plan,
  collab,
  onEdit,
  onRemove,
  onSave,
  onResolve,
  onDiscard,
  onReset
}: CollabPanelProps) {
  const pendingCount = collab.pending?.length ?? 0;
  const designerChanges = Object.keys(collab.drafts.designer.changes).length;
  const programmerChanges = Object.keys(collab.drafts.programmer.changes).length;

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="xl" bg="whiteAlpha.50" p={4}>
      <Flex align="center" mb={3}>
        <Heading size="sm">协同回路修改</Heading>
        <Spacer />
        {pendingCount ? <Badge colorScheme="orange">{pendingCount} 项待确认</Badge> : null}
      </Flex>

      <Text fontSize="xs" color="whiteAlpha.500" mb={3}>
        两人同时调整同一回路时，后保存的一方不会覆盖对方；差异逐灯具确认，双方草稿均保留。
      </Text>

      {collab.archived ? (
        <Alert status="success" borderRadius="lg" mb={3}>
          <AlertIcon />
          <AlertDescription fontSize="xs">
            上一轮差异已确认，双方草稿已保留为历史。可开始新一轮协同修改。
          </AlertDescription>
        </Alert>
      ) : null}

      <SimpleGrid columns={1} spacing={2}>
        <EditorDraft owner="designer" plan={plan} collab={collab} onEdit={onEdit} onRemove={onRemove} onSave={onSave} />
        <EditorDraft owner="programmer" plan={plan} collab={collab} onEdit={onEdit} onRemove={onRemove} onSave={onSave} />
      </SimpleGrid>

      {collab.archived ? (
        <Button mt={3} w="full" size="sm" variant="outline" onClick={onReset}>开始新一轮</Button>
      ) : null}

      {pendingCount ? (
        <MergeDialog plan={plan} collab={collab} onResolve={onResolve} onDiscard={onDiscard} />
      ) : null}
    </Box>
  );
}
