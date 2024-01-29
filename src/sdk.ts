import { Address, Sender, toNano, beginCell, Contract } from "@ton/core";
import { PinataStorage, S3Storage, Storage } from "./storage";
import { API } from "./api";
import { ExtendedTonClient4 } from "./ExtendedTonClient4";
import { getHttpV4Endpoint } from "@orbs-network/ton-access";
import { JettonContent, jettonContentToInternal } from "./jetton/content";
import { JettonMintRequest } from "./jetton/data";
import { NftContent, nftContentToInternal } from "./nft/content";
import { ExtendedContractProvider } from "./ExtendedContractProvider";
import { internalOnchainContentToCell } from "./utils";
import { JettonWallet } from "./jetton/JettonWallet";
import { Jetton } from "./jetton/Jetton";
import { NftCollection } from "./nft/NftCollection";
import { NftItem } from "./nft/NftItem";
import { SbtCollection } from "./nft/SbtCollection";
import { NftMintRequest, SbtMintRequest } from "./nft/data";
import { ContentResolver, DefaultContentResolver } from "./content";
import { NftSale } from "./nft/NftSale";

export interface PinataStorageParams {
    pinataApiKey: string
    pinataSecretKey: string
}

export interface S3StorageParams {
    s3AccessKeyId: string
    s3SecretAccessKey: string
    s3Bucket: string
}

export class GameFiSDK {
    constructor(public readonly storage: Storage, public readonly api: API, public readonly sender?: Sender, public readonly contentResolver?: ContentResolver) {}

    static async create(params: {
        storage: PinataStorageParams | S3StorageParams | Storage,
        api: 'mainnet' | 'testnet' | API,
        wallet?: { wallet: Contract, senderCreator: (provider: ExtendedContractProvider) => Sender } | Sender,
        contentResolver?: ContentResolver,
    }) {
        let storage: Storage;
        if ('pinataApiKey' in params.storage) {
            storage = new PinataStorage(params.storage.pinataApiKey, params.storage.pinataSecretKey);
        } else if ('s3AccessKeyId' in params.storage) {
            storage = new S3Storage(params.storage.s3AccessKeyId, params.storage.s3SecretAccessKey, params.storage.s3Bucket);
        } else {
            storage = params.storage;
        }

        let api: API;
        if (params.api === 'mainnet' || params.api === 'testnet') {
            const tc4 = new ExtendedTonClient4({ endpoint: await getHttpV4Endpoint({ network: params.api }), timeout: 15000 });
            api = { open: (contract) => tc4.openExtended(contract), provider: (addr, init) => tc4.provider(addr, init) };
        } else {
            api = params.api;
        }

        let sender: Sender | undefined = undefined;
        if (params.wallet !== undefined) {
            if ('senderCreator' in params.wallet) {
                sender = params.wallet.senderCreator(api.provider(params.wallet.wallet.address, params.wallet.wallet.init));
            } else {
                sender = params.wallet;
            }
        }

        return new GameFiSDK(storage, api, sender, params.contentResolver ?? new DefaultContentResolver());
    }

    async createJetton(content: JettonContent, options?: {
        onchainContent?: boolean,
        adminAddress?: Address,
        premint?: Exclude<JettonMintRequest, 'requestValue'>,
        value?: bigint,
    }) {
        const adminAddress = options?.adminAddress ?? this.sender?.address;
        if (adminAddress === undefined) {
            throw new Error('Admin address must be defined in options or be available in Sender');
        }
        const jetton = this.api.open(Jetton.create({
            admin: adminAddress,
            content: await this.contentToCell(jettonContentToInternal(content), options?.onchainContent ?? false),
        }, this.sender, this.contentResolver));
        const value = options?.value ?? toNano('0.05');
        if (options?.premint === undefined) {
            await jetton.sendDeploy(value);
        } else {
            await jetton.sendMint({
                ...options.premint,
                requestValue: value,
            });
        }
        return jetton;
    }

    openJetton(address: Address) {
        return this.api.open(Jetton.open(address, this.sender, this.contentResolver));
    }

    async createNftCollection(content: { collectionContent: NftContent, commonContent: string }, options?: {
        onchainContent?: boolean,
        adminAddress?: Address,
        premint?: Exclude<NftMintRequest, 'requestValue'>,
        value?: bigint,
    }) {
        const adminAddress = options?.adminAddress ?? this.sender?.address;
        if (adminAddress === undefined) {
            throw new Error('Admin address must be defined in options or be available in Sender');
        }
        const collection = this.api.open(NftCollection.create({
            admin: adminAddress,
            content: beginCell()
            .storeRef(await this.contentToCell(nftContentToInternal(content.collectionContent), options?.onchainContent ?? false))
            .storeRef(beginCell().storeStringTail(content.commonContent))
            .endCell(),
        }, this.sender, this.contentResolver));
        const value = options?.value ?? toNano('0.05');
        if (options?.premint === undefined) {
            await collection.sendDeploy(value);
        } else {
            await collection.sendMint({
                ...options.premint,
                requestValue: value,
            });
        }
        return collection;
    }

    openNftCollection(address: Address) {
        return this.api.open(NftCollection.open(address, this.sender, this.contentResolver));
    }

    async createSbtCollection(content: { collectionContent: NftContent, commonContent: string }, options?: {
        onchainContent?: boolean,
        adminAddress?: Address,
        premint?: Exclude<SbtMintRequest, 'requestValue'>,
        value?: bigint,
    }) {
        const adminAddress = options?.adminAddress ?? this.sender?.address;
        if (adminAddress === undefined) {
            throw new Error('Admin address must be defined in options or be available in Sender');
        }
        const collection = this.api.open(SbtCollection.create({
            admin: adminAddress,
            content: beginCell()
                .storeRef(await this.contentToCell(nftContentToInternal(content.collectionContent), options?.onchainContent ?? false))
                .storeRef(beginCell().storeStringTail(content.commonContent))
                .endCell(),
        }, this.sender, this.contentResolver));
        const value = options?.value ?? toNano('0.05');
        if (options?.premint === undefined) {
            await collection.sendDeploy(value);
        } else {
            await collection.sendMint({
                ...options.premint,
                requestValue: value,
            });
        }
        return collection;
    }

    openSbtCollection(address: Address) {
        return this.api.open(SbtCollection.open(address, this.sender, this.contentResolver));
    }

    openJettonWallet(address: Address) {
        return this.api.open(new JettonWallet(address, this.sender));
    }

    openNftItem(address: Address) {
        return this.api.open(new NftItem(address, this.sender, this.contentResolver));
    }

    async createNftSale(params: {
        createdAt?: number,
        marketplace?: Address | null,
        nft: Address,
        fullPrice: bigint,
        marketplaceFeeTo?: Address | null,
        marketplaceFee?: bigint,
        royaltyTo?: Address | null,
        royalty?: bigint,
        canDeployByExternal?: boolean,
        value?: bigint,
        queryId?: bigint,
    }) {
        const marketplaceAddress = params.marketplace ?? this.sender?.address
        if (marketplaceAddress === undefined) {
            throw new Error('Marketplace address must be defined in options or be available in Sender');
        }
        const sale = this.api.open(NftSale.create({
            createdAt: params.createdAt ?? Math.floor(Date.now() / 1000),
            marketplace: params.marketplace ?? null,
            nft: params.nft,
            fullPrice: params.fullPrice,
            marketplaceFeeTo: params.marketplaceFeeTo ?? null,
            marketplaceFee: params.marketplaceFee ?? 0n,
            royaltyTo: params.royaltyTo ?? null,
            royalty: params.royalty ?? 0n,
            canDeployByExternal: params.canDeployByExternal ?? true,
        }, this.sender));
        const value = params.value ?? toNano('0.05');
        await sale.sendTopup(value, params.queryId);
        return sale;
    }

    openNftSale(address: Address) {
        return this.api.open(NftSale.open(address, this.sender));
    }

    private async internalOffchainContentToCell(internal: Record<string, string | string[] | number | undefined>) {
        const contentUrl = await this.storage.uploadFile(Buffer.from(JSON.stringify(internal), 'utf-8'));
        return beginCell()
            .storeUint(0x01, 8)
            .storeStringTail(contentUrl)
            .endCell();
    }

    private async contentToCell(internal: Record<string, string | string[] | number | undefined>, onchain: boolean) {
        return onchain ? internalOnchainContentToCell(internal) : await this.internalOffchainContentToCell(internal);
    }
}
