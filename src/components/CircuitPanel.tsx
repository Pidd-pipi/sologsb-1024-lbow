import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  IconButton,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  Progress,
  Select,
  SimpleGrid,
  Spacer,
  Tag,
  Text,
  VStack,
  useToast
} from '@chakra-ui/react';
import { AlertTriangle, Plus, Trash2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { analyzePlan, sampleCircuitLoad } from '../state/load';
import type { Circuit, Cue, LightingPlan } from '../types';
import { formatTime } from '../state/useLightingDesk';

interface CircuitPanelProps {
  plan: LightingPlan;
  onAddCircuit: () => void;
  onUpdateCircuit: (circuitId: string, patch: Partial<Circuit>) => void;
  onDeleteCircuit: (circuitId: string) => void;
  onAssignCue: (cueId: string, circuitId: string) => void;
  onSelectCue: (sceneId: string, cueId: string) => void;
}

function LoadSparkline({ plan, circuit }: { plan: LightingPlan; circuit: Circuit }) {
  const samples = useMemo(() => sampleCircuitLoad(plan, circuit.id, 100), [plan, circuit.id]);
  const analysis = useMemo(() => analyzePlan(plan).find((item) => item.circuitId === circuit.id), [plan, circuit.id]);
  const width = 260;
  const height = 44;
  const max = Math.max(circuit.capacity, ...samples.map((s) => s.load), 1);
  const total = samples[samples.length - 1]?.time || 1;
  const points = samples
    .map((s, i) => {
      const x = (i / (samples.length - 1)) * width;
      const y = height - (s.load / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const capacityY = height - (circuit.capacity / max) * height;
  const peakX = analysis ? (analysis.peakTime / total) * width : 0;
  const peakY = analysis ? height - (analysis.peakLoad / max) * height : 0;

  return (
    <Box position="relative" w="100%">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        {analysis?.overloads.map((overload, index) => {
          const x0 = (overload.start / total) * width;
          const x1 = (overload.end / total) * width;
          return (
            <rect
              key={index}
              x={x0}
              y={0}
              width={Math.max(1, x1 - x0)}
              height={height}
              fill="rgba(229, 62, 62, 0.22)"
            />
          );
        })}
        <line x1={0} y1={capacityY} x2={width} y2={capacityY} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
        <polyline points={points} fill="none" stroke={analysis?.overloaded ? '#fc8181' : '#f6c453'} strokeWidth={1.6} />
        {analysis && analysis.peakLoad > 0 ? (
          <>
            <circle cx={peakX} cy={peakY} r={2.6} fill={analysis.overloaded ? '#fc8181' : '#68d391'} />
            <line x1={peakX} y1={0} x2={peakX} y2={height} stroke="rgba(255,255,255,0.25)" strokeDasharray="2 2" />
          </>
        ) : null}
      </svg>
      <Text position="absolute" right={1} top="1px" fontSize="9px" color="whiteAlpha.500">
        {circuit.capacity}A
      </Text>
    </Box>
  );
}

function CircuitRow({
  plan,
  circuit,
  cues,
  onUpdate,
  onDelete,
  onAssign,
  onSelectCue
}: {
  plan: LightingPlan;
  circuit: Circuit;
  cues: Cue[];
  onUpdate: (patch: Partial<Circuit>) => void;
  onDelete: () => void;
  onAssign: (cueId: string, circuitId: string) => void;
  onSelectCue: (sceneId: string, cueId: string) => void;
}) {
  const analysis = useMemo(() => analyzePlan(plan).find((item) => item.circuitId === circuit.id), [plan, circuit.id]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(circuit.name);
  const [capacity, setCapacity] = useState(circuit.capacity);
  const toast = useToast();

  if (!analysis) return null;
  const over = analysis.overloaded;
  const pct = Math.min(100, Math.round(analysis.utilization * 100));

  function save() {
    if (!name.trim()) {
      toast({ title: '回路名称不能为空', status: 'warning' });
      return;
    }
    if (capacity <= 0) {
      toast({ title: '额定电流必须大于 0', status: 'warning' });
      return;
    }
    onUpdate({ name: name.trim(), capacity });
    setEditing(false);
  }

  return (
    <Box
      p={3}
      borderRadius="lg"
      borderWidth="1px"
      borderColor={over ? 'red.600' : 'whiteAlpha.100'}
      bg={over ? 'red.900' : 'blackAlpha.200'}
    >
      <Flex align="center" gap={2} mb={1}>
        {over ? <AlertTriangle size={14} color="#fc8181" /> : <Zap size={14} color="#f6c453" />}
        {editing ? (
          <HStack flex="1" spacing={1}>
            <Input size="xs" value={name} onChange={(e) => setName(e.target.value)} w="120px" />
            <NumberInput size="xs" value={capacity} min={1} max={100} w="70px" onChange={(_, v) => setCapacity(Number(v) || 0)}>
              <NumberInputField />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
            <Text fontSize="xs" color="whiteAlpha.500">A</Text>
          </HStack>
        ) : (
          <Text fontWeight="650" fontSize="sm" flex="1" noOfLines={1}>{circuit.name}</Text>
        )}
        <Tag size="sm" colorScheme={over ? 'red' : analysis.utilization > 0.85 ? 'orange' : 'green'}>
          {over ? '过载' : `${pct}%`}
        </Tag>
        <Popover isOpen={editing} onClose={() => setEditing(false)}>
          <PopoverTrigger>
            <IconButton aria-label="编辑回路" size="xs" variant="ghost" icon={<Zap size={12} />} onClick={() => setEditing((v) => !v)} />
          </PopoverTrigger>
          <PopoverContent>
            <PopoverArrow />
            <PopoverCloseButton />
            <PopoverHeader fontSize="sm">编辑回路</PopoverHeader>
            <PopoverBody>
              <VStack spacing={2}>
                <FormControl>
                  <FormLabel fontSize="xs">回路名称</FormLabel>
                  <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="xs">额定电流（A）</FormLabel>
                  <NumberInput size="sm" value={capacity} min={1} max={200} onChange={(_, v) => setCapacity(Number(v) || 0)}>
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                <Button size="sm" colorScheme="amber" w="full" onClick={save}>保存</Button>
              </VStack>
            </PopoverBody>
          </PopoverContent>
        </Popover>
        <IconButton aria-label="删除回路" size="xs" variant="ghost" color="red.300" icon={<Trash2 size={12} />} onClick={onDelete} />
      </Flex>

      <LoadSparkline plan={plan} circuit={circuit} />

      <Flex mt={1} fontSize="10px" color="whiteAlpha.500" gap={3} flexWrap="wrap">
        <Text>峰值 {analysis.peakLoad.toFixed(1)}A @ {formatTime(analysis.peakTime)}</Text>
        <Text>额定 {circuit.capacity}A</Text>
        {over ? <Text color="red.300">冲突 {analysis.overloads.length} 段</Text> : null}
      </Flex>

      {over ? (
        <VStack align="stretch" mt={2} spacing={1}>
          {analysis.overloads.map((o, i) => (
            <Alert key={i} status="error" borderRadius="md" py={1} px={2}>
              <AlertIcon />
              <AlertDescription fontSize="11px">
                {formatTime(o.start)}–{formatTime(o.end)} 峰值 {o.peakLoad.toFixed(1)}A
              </AlertDescription>
            </Alert>
          ))}
        </VStack>
      ) : null}

      <Box mt={2}>
        <Text fontSize="10px" color="whiteAlpha.500" mb={1}>挂接灯具（{cues.length}）</Text>
        <HStack wrap="wrap" spacing={1}>
          {cues.map((cue) => (
            <Tag
              key={cue.id}
              size="sm"
              variant="subtle"
              colorScheme={cue.brightness > 0 ? 'blue' : 'gray'}
              cursor="pointer"
              onClick={() => {
                const scene = plan.scenes.find((s) => s.cues.some((c) => c.id === cue.id));
                if (scene) onSelectCue(scene.id, cue.id);
              }}
            >
              {cue.number}
            </Tag>
          ))}
          {!cues.length ? <Text fontSize="10px" color="whiteAlpha.400">暂无灯具</Text> : null}
        </HStack>
      </Box>
    </Box>
  );
}

export default function CircuitPanel({
  plan,
  onAddCircuit,
  onUpdateCircuit,
  onDeleteCircuit,
  onAssignCue,
  onSelectCue
}: CircuitPanelProps) {
  const analyses = useMemo(() => analyzePlan(plan), [plan]);
  const totalPeak = Math.max(0, ...analyses.map((a) => a.peakLoad));
  const overCount = analyses.filter((a) => a.overloaded).length;

  const cuesByCircuit = useMemo(() => {
    const map = new Map<string, Cue[]>();
    for (const scene of plan.scenes) {
      for (const cue of scene.cues) {
        if (!cue.circuitId) continue;
        if (!map.has(cue.circuitId)) map.set(cue.circuitId, []);
        map.get(cue.circuitId)!.push(cue);
      }
    }
    return map;
  }, [plan]);

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="xl" bg="whiteAlpha.50" p={4}>
      <Flex align="center" mb={3}>
        <Heading size="sm">回路负载</Heading>
        <Spacer />
        <Tag size="sm" colorScheme={overCount ? 'red' : 'green'}>{overCount ? `${overCount} 路过载` : '全部正常'}</Tag>
      </Flex>

      {overCount ? (
        <Alert status="error" borderRadius="lg" mb={3}>
          <AlertIcon />
          <AlertDescription fontSize="xs">
            {overCount} 条回路超过额定电流，已拒绝冻结与导出。峰值合计 {totalPeak.toFixed(1)}A。
          </AlertDescription>
        </Alert>
      ) : (
        <Alert status="success" borderRadius="lg" mb={3}>
          <AlertIcon />
          <AlertDescription fontSize="xs">全部回路在整剧时间内均未超过额定电流。</AlertDescription>
        </Alert>
      )}

      <VStack align="stretch" spacing={2}>
        {plan.circuits.map((circuit) => (
          <CircuitRow
            key={circuit.id}
            plan={plan}
            circuit={circuit}
            cues={cuesByCircuit.get(circuit.id) ?? []}
            onUpdate={(patch) => onUpdateCircuit(circuit.id, patch)}
            onDelete={() => onDeleteCircuit(circuit.id)}
            onAssign={onAssignCue}
            onSelectCue={onSelectCue}
          />
        ))}
      </VStack>

      <Button mt={3} w="full" size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={onAddCircuit}>
        新增回路
      </Button>
    </Box>
  );
}
