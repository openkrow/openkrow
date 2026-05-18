import { cofounderAgent } from "./founder";
import { marketingAgent } from "./marketing";
import { developmentAgent } from "./development";
import { legalAgent } from "./legal";
import { financeAgent } from "./finance";
import { operationsAgent } from "./operations";

export const agents = {
  cofounder: cofounderAgent,
  marketing: marketingAgent,
  development: developmentAgent,
  legal: legalAgent,
  finance: financeAgent,
  operations: operationsAgent,
};

export const agentMeta = [
  { name: "cofounder", label: "CoFounder", color: "#3B82F6", description: cofounderAgent.description! },
  { name: "marketing", label: "Marketing", color: "#F97316", description: marketingAgent.description! },
  { name: "development", label: "Development", color: "#10B981", description: developmentAgent.description! },
  { name: "legal", label: "Legal", color: "#8B5CF6", description: legalAgent.description! },
  { name: "finance", label: "Finance", color: "#06B6D4", description: financeAgent.description! },
  { name: "operations", label: "Operations", color: "#6B7280", description: operationsAgent.description! },
];
