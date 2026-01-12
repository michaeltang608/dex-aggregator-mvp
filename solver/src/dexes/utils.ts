import { getProvider } from "./provider";

export async function isContractExist(contract: string): Promise<boolean> {
  try {
    const code = await getProvider().getCode(contract);
    return code != "0x" && code.length > 2;
  } catch (error) {
    return false;
  }
}
