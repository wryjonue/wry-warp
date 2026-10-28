import { world, system, CommandPermissionLevel, CustomCommandParamType, Player, type CustomCommand, CustomCommandOrigin, type CustomCommandResult, Dimension, type Vector3, CustomCommandStatus } from "@minecraft/server";
import { MessageFormData, ModalFormData } from "@minecraft/server-ui";
enum WarpMode {
    Set = "set",
    Tp = "tp",
    Delete = "delete",
    List = "list"
}
system.beforeEvents.startup.subscribe(({ customCommandRegistry: ccr }) => {

    ccr.registerEnum("wry:warpmode", Object.values(WarpMode));

    const customWarpCommand: CustomCommand = {
        cheatsRequired: false,
        description: "Warp to your chosen coordinates.",
        name: "wry:warp",
        permissionLevel: CommandPermissionLevel.Any,
        mandatoryParameters: [
            {
                enumName: "wry:warpmode",
                name: "warpMode",
                type: CustomCommandParamType.Enum
            }

        ],
        optionalParameters: [
            {
                name: "warpName",
                type: CustomCommandParamType.String
            }
        ]

    };
    ccr.registerCommand(customWarpCommand, execWarpCommand);

    const WARP_HOME_COST = 1;
    const customHomeCommand: CustomCommand = {
        cheatsRequired: false,
        description: `Warp to Respawn Point. Costs ${WARP_HOME_COST} levels.`,
        name: "wry:home",
        permissionLevel: CommandPermissionLevel.Any,
    }

    ccr.registerCommand(customHomeCommand, (origin) => {
        const player: Player = origin.sourceEntity as Player;
        if (player.level < WARP_HOME_COST) {
            player.sendMessage(" ! §cYou don't have enough level to use this command.")
            return;
        }
        const dimloc = player.getSpawnPoint();
        if (!dimloc) {
            player.sendMessage(" ! §cYou didn't set any respawn point yet.")
            return;
        }
        const dimension = dimloc.dimension;
        const location = {
            x: dimloc.x,
            y: dimloc.y,
            z: dimloc.z
        };

        system.run(() => {
            player.teleport(location, { dimension })
            player.addLevels(-WARP_HOME_COST);
            player.sendMessage(` ! §aSuccessfully teleported to respawn point!`);
        });


    });

    const WARP_SPAWN_COST = 1;
    const customSpawnCommand = {
        cheatsRequired: false,
        description: `Teleports to World Spawn Lobby. Costs ${WARP_SPAWN_COST} levels.`,
        name: "wry:spawn",
        permissionLevel: CommandPermissionLevel.Any,
    }
    ccr.registerCommand(customSpawnCommand, (origin) => {
        const player = origin.sourceEntity;
        if (!(player instanceof Player)) return;
        if (player.level < WARP_SPAWN_COST) {
            player.sendMessage(" ! §cYou don't have enough level to use this command.")
            return;
        }

        system.run(() => {
            player.teleport(world.getDefaultSpawnLocation(), { dimension: world.getDimension("overworld") })
            player.addLevels(-WARP_SPAWN_COST);
            player.sendMessage(` ! §aSuccessfully teleported to world spawn!`);
        });
    });


});
function execWarpCommand(origin: CustomCommandOrigin, warpMode: WarpMode, warpName: string): undefined {
    system.run(() => {
        const WARP_SET_BASE_COST = 5;
        const WARP_TP_COST = 3;
        const player: Player = origin.sourceEntity as Player;
        // warp:warp_name
        const warpNames = player.getDynamicPropertyIds()
            .filter(d => d.startsWith("warp:"))
            .map(d => d.replace("warp:", ""));
        const warpModeName = {
            "set": async () => {
                if (!warpName) {
                    player.sendMessage(` ! §cYou didn't set a name for your warp.`);
                    return;
                }
                if (warpName.length > 16) {
                    player.sendMessage(` ! §cWarp names must be at most §b16 §ccharacters length.`)
                    return;
                }
                if (/[^A-Za-z0-9_\-\s]/.test(warpName)) {
                    player.sendMessage(` ! §cWarp names must not contain special characters, you can only use §balphanumeric(A-Z, a-z, 0-9), underscore(_), dash(-), and space ( ).`);
                    return;
                }
                let overwrite = false;
                if (warpNames.includes(warpName)) {
                    const response = await new MessageFormData()
                        .title("Overwrite")
                        .body("There's already a warp consisting that name. Do you want to instead overwrite existing warp?")
                        .button1("Overwrite")
                        .button2("Cancel")
                        .show(player)
                    if (response.canceled || response.selection) return;
                    overwrite = !response.selection; // 0 = true, 1 = false
                }

                const warpCost = overwrite ? WARP_SET_BASE_COST : WARP_SET_BASE_COST * (1 + warpNames.length);
                if (player.level < warpCost) {
                    player.sendMessage(` ! §cYou don't have enough level to set a warp. You will need §b${warpCost} §alevels.`);
                    return;
                }
                const dimension = player.dimension;
                const location = player.location;
                const dimloc = dimension.id + "\u001F" + JSON.stringify(location);
                player.setDynamicProperty("warp:" + warpName, dimloc);
                player.sendMessage(` ! §aWarp successfuly set at §b${location.x.toFixed(2)}, §c${location.z.toFixed(2)}, §d${location.z.toFixed(2)}`)
                player.addLevels(-warpCost);
                return;
            },
            "tp": () => {
                if (!warpName) {
                    player.sendMessage(` ! §cSet a name of the warp you want to teleport to.`);
                    return;
                }
                if (!warpNames.includes(warpName)) {
                    player.sendMessage(` ! §cWarp not found. Run §6/warp list§c to display your existing warps.`);
                    return;
                }
                if (player.level < WARP_TP_COST) {
                    player.sendMessage(` ! §cYou don't have enough levels. You will need §b${WARP_TP_COST} §alevels.`);
                    return;
                }
                const warp = getWarp(player, warpName)
                player.teleport(warp.location, { dimension: warp.dimension });
                player.addLevels(-WARP_TP_COST);
                player.sendMessage(` ! §aSuccessfully teleported to warp §e${warpName}§a!`);
            },
            "delete": async () => {
                if (!warpName) {
                    player.sendMessage(` ! §cSet a name of the warp you want to teleport to.`);
                    return;
                }
                if (!warpNames.includes(warpName)) {
                    player.sendMessage(` ! §cWarp not found. Run §6/warp list§c to display your existing warps.`);
                    return;
                }
                const response = await new ModalFormData()
                    .title("Delete")
                    .header("Delete Warp?")
                    .textField(`Type your warp name (§6${warpName}§r) again to delete your warp.`, warpName)
                    .submitButton("Submit")
                    .show(player)
                if (response.canceled) return;
                if (response?.formValues?.[1] != warpName) return;

                player.setDynamicProperty("warp:" + warpName);
                player.sendMessage(` ! §aWarp §6${warpName}§a succesfully deleted!`);

            },
            "list": () => {
                if (warpNames.length == 0) {
                    player.sendMessage(" ! You don't have any warp yet");
                    return;
                }
                player.sendMessage(" ! §eList of Warps")
                player.sendMessage(warpNames.map((d, index) => {
                    const warp = getWarp(player, d);
                    return `   §r${index + 1}. §e${d} §r- §a${warp.dimension.id.replace("minecraft:", "")} §b${warp.location.x.toFixed(2)} §c${warp.location.y.toFixed(2)} §d${warp.location.z.toFixed(2)}\n`
                }));
            }
        }
        warpModeName[warpMode as keyof typeof warpModeName]();
        
    })
}

interface WarpInfo {
    dimension: Dimension;
    location: Vector3;
}
function getWarp(player: Player, warpName: string): WarpInfo {
    if (!player) throw new Error("Player not found or disconnected.");
    const rawWarp: string = player.getDynamicProperty("warp:" + warpName) as string;
    const [dimensionId, locationStr] = rawWarp.split("\u001F") as [string, string];
    return ({
        dimension: world.getDimension(dimensionId),
        location: JSON.parse(locationStr)
    });
}